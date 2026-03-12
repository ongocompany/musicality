'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useWebPlayerStore } from '@/stores/web-player-store';

/**
 * Web video player hook using HTML5 <video> element.
 * Mirrors useWebAudioPlayer pattern but controls a video element ref.
 */
export function useWebVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    setPosition,
    setDuration,
    playbackRate,
  } = useWebPlayerStore();

  // ─── Bind video element ──────────────────────────────

  const bindVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      // Clean up previous
      if (videoRef.current) {
        videoRef.current.pause();
        cancelAnimationFrame(animFrameRef.current);
      }

      videoRef.current = el;

      if (!el) return;

      // Duration
      const onMeta = () => {
        if (el.duration && isFinite(el.duration)) {
          setDuration(el.duration * 1000);
        }
      };
      el.addEventListener('loadedmetadata', onMeta);

      // Ended
      const onEnded = () => {
        setIsPlaying(false);
        cancelAnimationFrame(animFrameRef.current);
      };
      el.addEventListener('ended', onEnded);

      // Apply rate
      el.playbackRate = playbackRate;
    },
    [setDuration, setIsPlaying, playbackRate],
  );

  // ─── Position update loop (requestAnimationFrame) ────

  const updatePosition = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const store = useWebPlayerStore.getState();

    if (!store.isSeeking) {
      const posMs = video.currentTime * 1000;

      // A-B loop logic
      if (
        store.loopEnabled &&
        store.loopStart !== null &&
        store.loopEnd !== null &&
        posMs >= store.loopEnd
      ) {
        video.currentTime = store.loopStart / 1000;
        store.setPosition(store.loopStart);
      } else {
        store.setPosition(posMs);
      }
    }

    animFrameRef.current = requestAnimationFrame(updatePosition);
  }, []);

  // Start/stop position loop based on isPlaying
  useEffect(() => {
    if (isPlaying && currentTrack?.mediaType === 'video') {
      animFrameRef.current = requestAnimationFrame(updatePosition);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, currentTrack?.mediaType, updatePosition]);

  // ─── Playback rate sync ──────────────────────────────

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // ─── Controls ────────────────────────────────────────

  const togglePlay = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      try {
        await video.play();
        setIsPlaying(true);
      } catch {
        // Autoplay blocked
      }
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const seekTo = useCallback(
    (posMs: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = posMs / 1000;
      setPosition(posMs);
    },
    [setPosition],
  );

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.paused) return;
    try {
      await video.play();
      setIsPlaying(true);
    } catch {
      // ignore
    }
  }, [setIsPlaying]);

  const pause = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    video.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  // ─── Cleanup on unmount ──────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return { videoRef, bindVideoElement, togglePlay, seekTo, play, pause };
}
