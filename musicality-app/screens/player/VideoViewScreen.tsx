/**
 * VideoViewScreen — 🔢 탭 (비디오/유튜브 View)
 * 하단 컨트롤바 숨김 → 그리드 공간 최대화
 * 비디오 탭 → 재생/일시정지
 * 화면 하단 탭 → 컨트롤 오버레이 잠시 표시
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, Animated, Platform, Dimensions, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import YoutubePlayer from 'react-native-youtube-iframe';

import { usePlayerCore } from '../../hooks/usePlayerCore';
import { usePlayerMode } from '../../hooks/usePlayerMode';
import { usePlayerStore } from '../../stores/playerStore';

import { PhraseGrid } from '../../components/ui/PhraseGrid';
import { VideoOverlay } from '../../components/ui/VideoOverlay';
import { SectionTimeline } from '../../components/ui/SectionTimeline';
import { SpeedPopup } from '../../components/ui/SpeedPopup';
import { ModeSegment } from '../../components/player/ModeSegment';
import { MarqueeTitle } from '../../components/player/MarqueeTitle';

import { Colors, Spacing } from '../../constants/theme';

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5];
const VIDEO_MAX_HEIGHT = Dimensions.get('window').height * 0.4;
const CONTROLS_AUTO_HIDE_MS = 3000;

interface VideoViewScreenProps {
  playerCore: ReturnType<typeof usePlayerCore>;
  playerMode: ReturnType<typeof usePlayerMode>;
}

export function VideoViewScreen({ playerCore, playerMode }: VideoViewScreenProps) {
  const videoAspectRatio = usePlayerStore((s) => s.videoAspectRatio);

  const {
    currentTrack, isPlaying, position, duration, playbackRate,
    isVideo, isYouTube,
    analysis, countInfo, phraseMap, effectiveBeats,
    loopStart, loopEnd, loopEnabled, gridScrollMode,
    cueEnabled, currentCellNotes, currentBeatNote,
    togglePlay, seekTo, setPlaybackRate, toggleCue,
    videoPlayer, youtubePlayer,
    handleGridTapBeat, handleSeekAndPlay, handleSeekOnly,
    handleSkipBack, handleSkipForward,
    handleSetLoopPoint, clearLoop,
    handleReArrangePhrase, handleSplitPhraseHere, handleMergeWithPrevious,
  } = playerCore;

  // ─── Controls overlay (탭하면 잠시 표시 → 자동 숨김) ───
  const [controlsVisible, setControlsVisible] = useState(false);
  const controlsAnim = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setControlsVisible(false);
      });
    }, CONTROLS_AUTO_HIDE_MS);
  }, [controlsAnim]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      Animated.timing(controlsAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setControlsVisible(false);
      });
    } else {
      showControls();
    }
  }, [controlsVisible, controlsAnim, showControls]);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

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

  return (
    <View style={styles.container}>
      <View style={styles.scrollArea}>
        {/* ① Header (minimal) */}
        <View style={styles.header}>
          <Ionicons
            name={isYouTube ? 'logo-youtube' : 'videocam'}
            size={18}
            color={isYouTube ? '#FF0000' : Colors.primary}
            style={{ marginRight: Spacing.xs }}
          />
          <MarqueeTitle text={currentTrack.title} style={styles.headerTitle} />
        </View>

        {/* ② YouTube Player */}
        {isYouTube && (
          <View style={styles.videoSection}>
            <View style={styles.youtubeContainer}>
              <YoutubePlayer
                ref={youtubePlayer.playerRef}
                height={200}
                videoId={currentTrack.uri}
                play={isPlaying}
                onReady={youtubePlayer.onReady}
                onChangeState={youtubePlayer.onStateChange}
                webViewProps={{
                  allowsInlineMediaPlayback: true,
                  injectedJavaScript: `
                    (function(){
                      document.addEventListener('message', function(e) {
                        window.dispatchEvent(new MessageEvent('message', {data: e.data}));
                      });
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
                {currentTrack.analysisStatus === 'done' && (
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

        {/* ③ Grid (read-only, 최대 공간) — 탭하면 컨트롤 토글 */}
        {currentTrack.analysisStatus === 'done' && (
          <TouchableWithoutFeedback onPress={toggleControls}>
            <View style={{ flex: 1, width: '100%' }}>
              <PhraseGrid
                countInfo={countInfo}
                phraseMap={phraseMap ?? null}
                hasAnalysis={!!analysis}
                beats={effectiveBeats}
                isPlaying={isPlaying}
                onTapBeat={handleGridTapBeat}
                onSeekAndPlay={handleSeekAndPlay}
                onSeekOnly={handleSeekOnly}
                onSetLoopPoint={handleSetLoopPoint}
                onClearLoop={clearLoop}
                loopStart={loopStart}
                loopEnd={loopEnd}
                scrollMode={gridScrollMode}
                cellNotes={currentCellNotes}
                currentBeatNote={currentBeatNote}
                editMode="none"
              />
            </View>
          </TouchableWithoutFeedback>
        )}
      </View>

      {/* ④ Controls overlay — 탭 시 잠시 나타남 */}
      {controlsVisible && (
        <Animated.View style={[styles.controlsOverlay, { opacity: controlsAnim }]}>
          {/* Seek */}
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
          {/* Bottom bar */}
          <View style={styles.bottomBar}>
            <View style={[styles.bottomBarSide, { justifyContent: 'flex-end' }]}>
              <ModeSegment
                gridState={playerMode.gridSegState}
                formState={playerMode.formSegState}
                onGridTap={playerMode.onGridTap}
                onGridLongPress={playerMode.onGridLongPress}
                onFormTap={playerMode.onFormTap}
                onFormLongPress={playerMode.onFormLongPress}
                formDisabled={true}
              />
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
            </View>
          </View>
        </Animated.View>
      )}
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
  videoSection: { width: '100%', alignItems: 'center' },
  youtubeContainer: { width: '100%', position: 'relative' },
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
  controlsOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(18,18,18,0.92)',
    borderTopWidth: 1, borderTopColor: Colors.surface,
  },
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
});
