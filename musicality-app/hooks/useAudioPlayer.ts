import { useRef, useEffect, useCallback } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { usePlayerStore } from '../stores/playerStore';
import { ensureFileAvailable } from '../services/fileImport';

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

      // Ensure file exists (auto-recover from cloud if evicted)
      const validUri = await ensureFileAvailable(currentTrack);
      if (!validUri) {
        console.warn(`[AudioPlayer] File unrecoverable: ${currentTrack.uri.slice(-50)}`);
        return;
      }
      // Update track URI if recovered to a new path
      if (validUri !== currentTrack.uri) {
        usePlayerStore.getState().updateTrackData(currentTrack.id, { uri: validUri });
      }
      const playUri = validUri;

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: playUri },
        { shouldPlay: false, rate: playbackRate, progressUpdateIntervalMillis: 100 },
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
      // If track finished (position at/near end), restart from beginning
      if (
        status.durationMillis &&
        status.positionMillis >= status.durationMillis - 500
      ) {
        await soundRef.current.setPositionAsync(0);
        setPosition(0);
      }
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
