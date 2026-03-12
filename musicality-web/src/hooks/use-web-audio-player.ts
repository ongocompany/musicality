'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useWebPlayerStore } from '@/stores/web-player-store';

/**
 * Web audio player hook using HTML5 Audio API.
 * Mirrors mobile app's useAudioPlayer but for browser.
 */
export function useWebAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);

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
    isSeeking,
  } = useWebPlayerStore();

  // ─── Load track ─────────────────────────────────────────
  useEffect(() => {
    // Clean up previous
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);

    if (!currentTrack || currentTrack.mediaType !== 'audio') return;

    const audio = new Audio(currentTrack.fileUrl);
    audio.preload = 'auto';
    audioRef.current = audio;

    // Duration
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration * 1000);
      }
    });

    // Ended
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
    });

    // Apply playback rate
    audio.playbackRate = playbackRate;

    return () => {
      audio.pause();
      audio.src = '';
      cancelAnimationFrame(animFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // ─── Position update loop (requestAnimationFrame) ──────
  const updatePosition = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const store = useWebPlayerStore.getState();

    if (!store.isSeeking) {
      const posMs = audio.currentTime * 1000;

      // A-B loop logic
      if (
        store.loopEnabled &&
        store.loopStart !== null &&
        store.loopEnd !== null &&
        posMs >= store.loopEnd
      ) {
        audio.currentTime = store.loopStart / 1000;
        store.setPosition(store.loopStart);
      } else {
        store.setPosition(posMs);
      }
    }

    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, []);

  // Start/stop position loop based on isPlaying
  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePosition);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, updatePosition]);

  // ─── Playback rate sync ────────────────────────────────
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // ─── Controls ──────────────────────────────────────────

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        // Autoplay blocked — ignore
      }
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const seekTo = useCallback(
    (posMs: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = posMs / 1000;
      setPosition(posMs);
    },
    [setPosition],
  );

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;
    try {
      await audio.play();
      setIsPlaying(true);
    } catch {
      // ignore
    }
  }, [setIsPlaying]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    audio.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  return { togglePlay, seekTo, play, pause, audioRef };
}
