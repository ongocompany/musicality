/**
 * VideoScreen — 비디오/유튜브 통합 화면
 * 자동숨김 컨트롤 (3초) + 풀 편집 기능
 * View/Edit 구분 없음 — 하나의 화면으로 통합
 * YouTube 미분석: TapTempo UI 포함
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Dimensions, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Video, ResizeMode } from 'expo-av';
import YoutubePlayer from 'react-native-youtube-iframe';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { useFocusMode } from '../../hooks/useFocusMode';
import { usePlayerStore } from '../../stores/playerStore';
import { useSettingsStore } from '../../stores/settingsStore';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';
import { SettingsModal } from '../../components/player/SettingsModal';

import { Colors, Spacing, FontSize } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];
const SCREEN_WIDTH = Dimensions.get('window').width;
const VIDEO_MAX_HEIGHT = Dimensions.get('window').height * 0.55;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const YT_HEIGHT_LANDSCAPE = Math.round(SCREEN_WIDTH * 9 / 16); // 16:9 → ~200px
const YT_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.55);        // 화면 55% 제한
const CONTROLS_AUTO_HIDE_MS = 3000;

interface VideoScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function VideoScreen({ playerCore, playerMode }: VideoScreenProps) {
  const { t } = useTranslation();
  const [settingsVisible, setSettingsVisible] = useState(false);
  const videoAspectRatio = usePlayerStore((s) => s.videoAspectRatio);

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    isVideo, isYouTube,
    analysis, countInfo, phraseMap, effectiveBeats,
    currentBpm, beatTimeOffset, bpmOverride,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote, canUndo,
    togglePlay, seekTo, setPlaybackRate, toggleCue,
    setBeatTimeOffset, clearBpmOverride,
    videoPlayer, youtubePlayer,
    tapBpm, recordTap, adjustBpm, handleNowIsOne,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward, handleUndo,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
    handleSetCellNote, handleClearCellNote,
    handleSharePhraseNote, runAnalysis,
  } = playerCore;

  // YouTube 높이: 기본 16:9 + 세로 영상은 iframe CSS로 꽉 채움
  const ytHeight = YT_MAX_HEIGHT;

  // YouTube 전체화면 복귀 시 터치 먹통 방지 — 강제 리마운트
  const [ytMountKey, setYtMountKey] = useState(0);
  const ytSavedTimeRef = useRef(0);
  const onYtFullScreenChange = useCallback((isFs: boolean) => {
    if (!isFs) {
      ytSavedTimeRef.current = usePlayerStore.getState().position;
      setYtMountKey(k => k + 1);
    }
  }, []);

  const hasDoneAnalysis = currentTrack?.analysisStatus === 'done';

  // ─── Controls: 오디오와 동일 (슬라이드 + 핸들) ───
  const focus = useFocusMode(hasDoneAnalysis ? CONTROLS_AUTO_HIDE_MS : undefined);

  // 네이티브 비디오: 미분석 상태로 진입 시 자동 분석 시작
  useEffect(() => {
    if (isVideo && currentTrack && currentTrack.analysisStatus === 'idle') {
      runAnalysis();
    }
  }, [isVideo, currentTrack?.id]);

  useEffect(() => {
    if (hasDoneAnalysis) scheduleHide();
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, [hasDoneAnalysis]);

  // ─── Video collapse/expand ───
  const videoCollapseAnim = useRef(new Animated.Value(1)).current;
  const [videoCollapsed, setVideoCollapsed] = useState(false);

  const collapseVideo = useCallback(() => {
    setVideoCollapsed(true);
    Animated.spring(videoCollapseAnim, { toValue: 0, useNativeDriver: false }).start();
  }, [videoCollapseAnim]);

  const expandVideo = useCallback(() => {
    setVideoCollapsed(false);
    Animated.spring(videoCollapseAnim, { toValue: 1, useNativeDriver: false }).start();
  }, [videoCollapseAnim]);

  const videoSwipeResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 15,
    onPanResponderRelease: (_, gs) => {
      if (gs.dy < -30 && !videoCollapsed) collapseVideo();
      else if (gs.dy > 30 && videoCollapsed) expandVideo();
    },
  })).current;

  if (!currentTrack) return null;

  const displayBpm = bpmOverride ?? currentBpm ?? (analysis?.bpm ? Math.round(analysis.bpm) : 0);

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header — S● + BPM + ⚙️ */}
        <View style={styles.header}>
          <Ionicons
            name={isYouTube ? 'logo-youtube' : 'videocam'}
            size={18}
            color={isYouTube ? '#FF0000' : Colors.primary}
            style={{ marginRight: Spacing.xs }}
          />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
          <View style={styles.headerMeta}>
            {hasDoneAnalysis && (
              <View style={styles.slotBadge}>
                <Text style={styles.slotText}>S</Text>
                <View style={styles.autoDot} />
              </View>
            )}
            {displayBpm > 0 && (
              <View style={styles.bpmBadge}>
                <Text style={styles.bpmText}>{displayBpm} BPM</Text>
              </View>
            )}
            {hasDoneAnalysis && (
              <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
                <Ionicons name="settings-outline" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ② YouTube Player */}
        {isYouTube && (
          <View style={styles.videoSection}>
            <View style={styles.youtubeContainer}>
              <YoutubePlayer
                key={ytMountKey}
                ref={youtubePlayer.playerRef}
                height={ytHeight}
                videoId={currentTrack.uri}
                play={isPlaying}
                onReady={youtubePlayer.onReady}
                onFullScreenChange={onYtFullScreenChange}
                initialPlayerParams={{
                  start: Math.floor(ytSavedTimeRef.current / 1000),
                  preventFullScreen: true,
                }}
                onChangeState={youtubePlayer.onStateChange}
                webViewProps={{
                  allowsInlineMediaPlayback: true,
                  nestedScrollEnabled: false,
                  overScrollMode: 'never',
                  injectedJavaScript: `
                    (function(){
                      document.addEventListener('message', function(e) {
                        window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                      });
                      // 라이브러리 기본 padding-bottom:56.25% (16:9 강제) 오버라이드
                      var s = document.createElement('style');
                      s.textContent = 'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;}' +
                        '.container{padding-bottom:0!important;height:100vh!important;width:100%!important;position:relative!important;}' +
                        '.video{position:absolute!important;top:0!important;left:0!important;width:100%!important;height:100%!important;}';
                      document.head.appendChild(s);
                    })(); true;
                  `,
                }}
              />
              {analysis && (
                <View style={styles.youtubeOverlay} pointerEvents="none">
                  <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
                </View>
              )}
            </View>
          </View>
        )}

        {/* ② Native Video Player */}
        {isVideo && (
          <View style={styles.videoSection}>
            <Animated.View
              style={{
                maxHeight: videoCollapseAnim.interpolate({
                  inputRange: [0, 1], outputRange: [0, VIDEO_MAX_HEIGHT],
                }),
                opacity: videoCollapseAnim, overflow: 'hidden',
              }}
              {...videoSwipeResponder.panHandlers}
            >
              <View style={[styles.videoContainer, { aspectRatio: videoAspectRatio }]}>
                <Video
                  ref={videoPlayer.videoRef}
                  source={{ uri: currentTrack.uri }}
                  style={styles.video}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
                  progressUpdateIntervalMillis={Platform.OS === 'android' ? 200 : 100}
                  onPlaybackStatusUpdate={videoPlayer.onPlaybackStatusUpdate}
                  onReadyForDisplay={videoPlayer.onReadyForDisplay}
                />
                {hasDoneAnalysis && (
                  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    <VideoOverlay countInfo={countInfo} hasAnalysis={!!analysis} />
                  </View>
                )}
              </View>
            </Animated.View>
            {/* Collapse/expand handle */}
            <View {...(videoCollapsed ? videoSwipeResponder.panHandlers : {})}>
              <TouchableOpacity
                style={[styles.collapseHandle, videoCollapsed && styles.collapseHandleExpanded]}
                onPress={videoCollapsed ? expandVideo : collapseVideo}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={videoCollapsed ? 'chevron-down' : 'chevron-up'}
                  size={videoCollapsed ? 20 : 16}
                  color={videoCollapsed ? Colors.primary : Colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ③-A Grid (분석 완료) */}
        {hasDoneAnalysis && (
          <View style={{ flex: 1, width: '100%' }}>
            <PhraseGrid
              countInfo={countInfo}
              phraseMap={phraseMap ?? null}
              hasAnalysis={!!analysis}
              beats={effectiveBeats}
              isPlaying={isPlaying}
              onTapBeat={(idx) => { handleGridTapBeat(idx); showControls(); }}
              onReArrangePhrase={handleReArrangePhrase}
              onSplitPhraseHere={handleSplitPhraseHere}
              onSetLoopPoint={handleSetLoopPoint}
              onClearLoop={clearLoop}
              onSeekAndPlay={(ms) => { handleSeekAndPlay(ms); showControls(); }}
              onSeekOnly={(ms) => { handleSeekOnly(ms); showControls(); }}
              onMergeWithPrevious={handleMergeWithPrevious}
              loopStart={loopStart}
              loopEnd={loopEnd}
              scrollMode={gridScrollMode}
              cellNotes={currentCellNotes}
              onSetCellNote={handleSetCellNote}
              onClearCellNote={handleClearCellNote}
              currentBeatNote={currentBeatNote}
              editMode="note"
            />
          </View>
        )}

        {/* ③-B TapTempo (YouTube 미분석) */}
        {!hasDoneAnalysis && isYouTube && (
          <View style={styles.tapTempoSection}>
            <View style={styles.tapTempoRow}>
              <TouchableOpacity style={styles.tapButton} onPress={recordTap} activeOpacity={0.6}>
                <Ionicons name="hand-left" size={24} color={Colors.text} />
                <Text style={styles.tapButtonText}>TAP</Text>
              </TouchableOpacity>
              <View style={styles.tapBpmContainer}>
                <TouchableOpacity onPress={() => adjustBpm(-1)} style={styles.bpmAdjust}>
                  <Ionicons name="remove-circle-outline" size={28} color={Colors.textSecondary} />
                </TouchableOpacity>
                <Text style={styles.tapBpmValue}>{tapBpm > 0 ? tapBpm : '--'}</Text>
                <Text style={styles.tapBpmLabel}>BPM</Text>
                <TouchableOpacity onPress={() => adjustBpm(1)} style={styles.bpmAdjust}>
                  <Ionicons name="add-circle-outline" size={28} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.nowIsOneButton, tapBpm <= 0 && styles.disabledButton]}
              onPress={handleNowIsOne}
              disabled={tapBpm <= 0}
            >
              <Ionicons name="locate" size={20} color={tapBpm > 0 ? Colors.tapAccent : Colors.textMuted} />
              <Text style={[styles.nowIsOneText, tapBpm <= 0 && { color: Colors.textMuted }]}>
                {t('player.nowIsOne')}
              </Text>
            </TouchableOpacity>
            <Text style={styles.tapTempoHint}>{t('player.tapInstruction')}</Text>
          </View>
        )}

        {/* ③-B 분석 중/대기 (Native Video) */}
        {!hasDoneAnalysis && isVideo && (
          <View style={styles.analyzingContainer}>
            <Text style={styles.analyzingText}>
              {currentTrack.analysisStatus === 'analyzing' ? t('player.analyzing', { defaultValue: '분석 중...' }) : t('player.startAnalysis', { defaultValue: '분석 준비 중...' })}
            </Text>
          </View>
        )}
      </View>

      {/* ④ Focus handle */}
      <TouchableOpacity
        style={[styles.focusHandle, focus.focusMode && styles.focusHandleActive]}
        onPress={focus.focusMode ? focus.exitFocusMode : focus.enterFocusMode}
        activeOpacity={0.7}
      >
        <Ionicons
          name={focus.focusMode ? 'chevron-up' : 'chevron-down'}
          size={focus.focusMode ? 20 : 16}
          color={focus.focusMode ? Colors.primary : Colors.textMuted}
        />
      </TouchableOpacity>

      {/* ⑤ Seek — hidden in focus mode */}
      <Animated.View style={{
        maxHeight: focus.focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 500] }),
        opacity: focus.focusAnim, overflow: 'hidden',
      }}>
        {hasDoneAnalysis && (
          <View style={styles.seekSection}>
            {phraseMap && analysis && (
              <SectionTimeline
                phrases={phraseMap.phrases}
                duration={duration > 0 ? duration / 1000 : analysis.duration}
                currentTimeMs={position}
                waveformPeaks={analysis.waveformPeaks}
                onSeek={seekTo}
                onSeekStart={() => playerCore.setIsSeeking(true)}
                onSeekEnd={() => playerCore.setIsSeeking(false)}
                loopStart={loopStart}
                loopEnd={loopEnd}
                loopEnabled={loopEnabled}
              />
            )}
          </View>
        )}
      </Animated.View>

      {/* ⑥ Bottom bar — hidden in focus mode */}
      <Animated.View style={[styles.bottomBar, {
        maxHeight: focus.focusAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 60] }),
        opacity: focus.focusAnim, overflow: 'hidden',
      }]}>
        <View style={[styles.bottomBarSide, { justifyContent: 'flex-end' }]}>
          <View style={styles.modeBtn}>
            <Ionicons name="grid-outline" size={18} color={Colors.primary} />
          </View>
          <SpeedPopup currentRate={playbackRate} rates={RATES} onSelectRate={setPlaybackRate} />
          <TouchableOpacity onPress={handleSkipBack} onLongPress={() => seekTo(0)} delayLongPress={400}>
            <Ionicons name="play-back" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={[styles.bottomBarSide, { justifyContent: 'flex-start' }]}>
          <TouchableOpacity onPress={handleSkipForward}>
            <Ionicons name="play-forward" size={22} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleCue}>
            <Ionicons
              name={cueEnabled ? 'volume-high' : 'volume-mute'} size={20}
              color={cueEnabled ? Colors.accent : Colors.textMuted}
            />
          </TouchableOpacity>
          {hasDoneAnalysis && (
            <TouchableOpacity onPress={handleUndo} disabled={!canUndo} style={{ opacity: canUndo ? 1 : 0.3 }}>
              <Ionicons name="arrow-undo" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ⚙️ Settings modal */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        beatTimeOffset={beatTimeOffset}
        bpm={displayBpm}
        onAdjustOffset={(delta) => currentTrack && setBeatTimeOffset(currentTrack.id, beatTimeOffset + delta)}
        onResetOffset={() => currentTrack && setBeatTimeOffset(currentTrack.id, 0)}
        onExport={() => { setSettingsVisible(false); handleSharePhraseNote(null); }}
        onImport={() => { setSettingsVisible(false); playerCore.handleImportPhraseNote(); }}
        onReanalyze={() => { setSettingsVisible(false); runAnalysis(); }}
        onEditBpm={() => {}}
        onResetAll={() => {
          setSettingsVisible(false);
          if (currentTrack) {
            clearBpmOverride(currentTrack.id);
            setBeatTimeOffset(currentTrack.id, 0);
            playerCore.clearDraft(currentTrack.id);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 6,
  },
  headerTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  headerMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  slotBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(187,134,252,0.5)',
    backgroundColor: 'rgba(187,134,252,0.08)',
  },
  slotText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  autoDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.success },
  bpmBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10,
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
  bpmText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  settingsBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoSection: { width: '100%', alignItems: 'center' },
  youtubeContainer: { width: '100%', position: 'relative', marginBottom: 10 },
  youtubeOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  videoContainer: {
    width: '100%', backgroundColor: '#000',
    maxHeight: VIDEO_MAX_HEIGHT,
  },
  video: { width: '100%', height: '100%' },
  collapseHandle: {
    alignItems: 'center', paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  collapseHandleExpanded: {
    paddingVertical: 12,
    backgroundColor: 'rgba(187,134,252,0.1)',
  },

  // ─── TapTempo ───
  tapTempoSection: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md, marginTop: Spacing.md,
    borderRadius: 12,
  },
  tapTempoRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.md, marginTop: Spacing.sm,
  },
  tapButton: {
    width: 64, height: 56, borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  tapButtonText: {
    color: Colors.text, fontSize: FontSize.xs,
    fontWeight: '700', marginTop: 2,
  },
  tapBpmContainer: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: Spacing.xs,
  },
  bpmAdjust: { padding: Spacing.xs },
  tapBpmValue: {
    color: Colors.text, fontSize: 32, fontWeight: '800',
    fontVariant: ['tabular-nums'], minWidth: 60, textAlign: 'center',
  },
  tapBpmLabel: {
    color: Colors.textSecondary, fontSize: FontSize.sm, fontWeight: '600',
  },
  nowIsOneButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: 48, borderRadius: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1, borderColor: Colors.tapAccent,
    marginTop: Spacing.sm,
  },
  nowIsOneText: {
    color: Colors.tapAccent, fontSize: 10, fontWeight: '700', marginTop: 2,
  },
  disabledButton: { opacity: 0.4, borderColor: Colors.textMuted },
  tapTempoHint: {
    color: Colors.textSecondary, fontSize: FontSize.xs,
    textAlign: 'center', marginTop: Spacing.sm,
  },
  analyzingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl,
  },
  analyzingText: { color: Colors.textMuted, fontSize: 14 },

  // ─── Controls overlay ───
  focusHandle: {
    alignItems: 'center', paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  focusHandleActive: { backgroundColor: 'rgba(187,134,252,0.1)' },
  seekSection: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    height: 56,
  },
  bottomBarSide: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
  },
  playButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    marginHorizontal: Spacing.md,
  },
  modeBtn: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(187,134,252,0.2)',
  },
});
