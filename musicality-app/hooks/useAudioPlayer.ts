import { useRef, useEffect, useCallback } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';

export function useAudioPlayer() {
  const soundRef = useRef<Audio.Sound | null>(null);
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

  // Load track
  useEffect(() => {
    let mounted = true;

    async function loadTrack() {
      // Unload previous
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (!currentTrack || currentTrack.mediaType === 'video' || currentTrack.mediaType === 'youtube') return;

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: currentTrack.uri },
        { shouldPlay: false, rate: playbackRate, progressUpdateIntervalMillis: 50 },
        onPlaybackStatusUpdate,
      );

      if (mounted) {
        soundRef.current = sound;
      } else {
        await sound.unloadAsync();
      }
    }

    loadTrack();
    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [currentTrack?.id]);

  // Playback status callback
  const onPlaybackStatusUpdate = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;

      // Don't update position while user is dragging the seek bar
      const store = usePlayerStore.getState();
      if (!store.isSeeking) {
        setPosition(status.positionMillis);
      }
      if (status.durationMillis) {
        setDuration(status.durationMillis);
      }

      // Loop logic — guard against concurrent seeks
      if (
        store.loopEnabled &&
        store.loopStart !== null &&
        store.loopEnd !== null &&
        status.positionMillis >= store.loopEnd &&
        !seekingRef.current
      ) {
        seekingRef.current = true;
        soundRef.current?.setPositionAsync(store.loopStart).catch(() => {}).finally(() => {
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
    if (!soundRef.current) return;
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) return;

    if (status.isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  }, []);

  // Seek — catch "Seeking interrupted" errors
  const seekTo = useCallback(async (posMs: number) => {
    if (!soundRef.current) return;
    try {
      seekingRef.current = true;
      await soundRef.current.setPositionAsync(posMs);
      setPosition(posMs);
    } catch {
      // "Seeking interrupted" — safe to ignore
    } finally {
      seekingRef.current = false;
    }
  }, []);

  // Playback rate
  useEffect(() => {
    if (!soundRef.current) return;
    soundRef.current.setRateAsync(playbackRate, true).catch(() => {});
  }, [playbackRate]);

  return { togglePlay, seekTo, sound: soundRef };
}
