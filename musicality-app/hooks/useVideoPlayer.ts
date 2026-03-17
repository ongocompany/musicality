import { useRef, useEffect, useCallback } from 'react';
import { Platform, InteractionManager } from 'react-native';
import { Video, AVPlaybackStatus, VideoReadyForDisplayEvent } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';

/**
 * Video playback hook — mirrors useAudioPlayer API.
 * Uses expo-av Video ref instead of Audio.Sound.
 *
 * The Video component itself is rendered in player.tsx;
 * this hook provides the ref + control methods.
 */
export function useVideoPlayer() {
  const videoRef = useRef<Video>(null);
  const seekingRef = useRef(false);
  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    setPosition,
    setDuration,
    playbackRate,
    loopEnabled,
    loopStart,
    loopEnd,
  } = usePlayerStore();

  // Playback status callback — on Android, defer position updates to avoid
  // blocking the UI thread while Video's SurfaceView is rendering
  const pendingPositionRef = useRef<number | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      const store = usePlayerStore.getState();
      if (!store.isSeeking) {
        if (Platform.OS === 'android') {
          // Batch position updates via requestAnimationFrame to avoid UI thread starvation
          pendingPositionRef.current = status.positionMillis;
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              if (pendingPositionRef.current !== null) {
                setPosition(pendingPositionRef.current);
                pendingPositionRef.current = null;
              }
              rafRef.current = null;
            });
          }
        } else {
          setPosition(status.positionMillis);
        }
      }
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }

      // Loop logic
      if (
        store.loopEnabled &&
        store.loopStart !== null &&
        store.loopEnd !== null &&
        status.positionMillis >= store.loopEnd &&
        !seekingRef.current
      ) {
        seekingRef.current = true;
        videoRef.current
          ?.setPositionAsync(store.loopStart)
          .catch(() => {})
          .finally(() => {
            seekingRef.current = false;
          });
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
      }
    },
    [],
  );

  // Play / Pause
  const togglePlay = useCallback(async () => {
    if (!videoRef.current) return;
    const status = await videoRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setIsPlaying(true);
    }
  }, []);

  // Seek
  const seekTo = useCallback(async (posMs: number) => {
    if (!videoRef.current) return;
    try {
      seekingRef.current = true;
      await videoRef.current.setPositionAsync(posMs);
      setPosition(posMs);
    } catch {
      // "Seeking interrupted" — safe to ignore
    } finally {
      seekingRef.current = false;
    }
  }, []);

  // Playback rate
  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.setRateAsync(playbackRate, true).catch(() => {});
  }, [playbackRate]);

  // Capture video natural aspect ratio from onReadyForDisplay event
  const onReadyForDisplay = useCallback((event: VideoReadyForDisplayEvent) => {
    const { width, height } = event.naturalSize;
    if (width > 0 && height > 0) {
      const ratio = width / height;
      const store = usePlayerStore.getState();
      if (Math.abs(store.videoAspectRatio - ratio) > 0.01) {
        store.setVideoAspectRatio(ratio);
      }
    }
  }, []);

  // Cleanup on track change — reset refs + pause + unload
  useEffect(() => {
    // Reset batch refs on new track
    pendingPositionRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    return () => {
      videoRef.current?.pauseAsync().catch(() => {});
      videoRef.current?.unloadAsync().catch(() => {});
      pendingPositionRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [currentTrack?.id]);

  return { videoRef, togglePlay, seekTo, onPlaybackStatusUpdate, onReadyForDisplay };
}
