'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useWebPlayerStore } from '@/stores/web-player-store';

/**
 * YouTube player hook using IFrame Player API.
 * Polls position at 200ms intervals (YouTube API doesn't push position).
 */

// ─── YouTube IFrame API types ─────────────────────────

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

// YouTube player states
const YT_STATES = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

// ─── Load YouTube IFrame API (singleton) ──────────────

let ytApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    if (typeof window === 'undefined') return;

    // Already loaded
    if ((window as any).YT && (window as any).YT.Player) {
      resolve();
      return;
    }

    // Set callback
    (window as any).onYouTubeIframeAPIReady = () => resolve();

    // Inject script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });

  return ytApiPromise;
}

// ─── Extract YouTube video ID ─────────────────────────

export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const re of patterns) {
    const match = url.match(re);
    if (match) return match[1];
  }
  return null;
}

// ─── Hook ─────────────────────────────────────────────

export function useWebYouTubePlayer() {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isReadyRef = useRef(false);
  const seekingRef = useRef(false);
  const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [ytReady, setYtReady] = useState(false);

  const {
    currentTrack,
    isPlaying,
    setIsPlaying,
    setPosition,
    setDuration,
    playbackRate,
  } = useWebPlayerStore();

  // ─── Initialize YouTube player ──────────────────────

  const initPlayer = useCallback(
    async (containerId: string, videoId: string) => {
      await loadYouTubeApi();

      // Destroy previous
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }

      isReadyRef.current = false;
      setYtReady(false);

      const YT = (window as any).YT;

      playerRef.current = new YT.Player(containerId, {
        videoId,
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            isReadyRef.current = true;
            setYtReady(true);
            const dur = event.target.getDuration();
            if (dur > 0) setDuration(dur * 1000);
            event.target.setPlaybackRate(playbackRate);
          },
          onStateChange: (event: YTPlayerEvent) => {
            switch (event.data) {
              case YT_STATES.PLAYING:
                setIsPlaying(true);
                break;
              case YT_STATES.PAUSED:
                setIsPlaying(false);
                break;
              case YT_STATES.ENDED:
                setIsPlaying(false);
                break;
            }
          },
        },
      }) as YTPlayer;
    },
    [setDuration, setIsPlaying, playbackRate],
  );

  // ─── Position polling (200ms) ────────────────────────

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!isPlaying || !isReadyRef.current || !playerRef.current) return;

    pollingRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player || !isReadyRef.current || seekingRef.current) return;

      const store = useWebPlayerStore.getState();
      if (store.isSeeking) return;

      try {
        const posMs = player.getCurrentTime() * 1000;

        // A-B loop logic
        if (
          store.loopEnabled &&
          store.loopStart !== null &&
          store.loopEnd !== null &&
          posMs >= store.loopEnd
        ) {
          player.seekTo(store.loopStart / 1000, true);
          store.setPosition(store.loopStart);
        } else {
          store.setPosition(posMs);
        }
      } catch {
        // Player might be destroyed
      }
    }, 200);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isPlaying]);

  // ─── Playback rate sync ──────────────────────────────

  useEffect(() => {
    if (playerRef.current && isReadyRef.current) {
      try {
        playerRef.current.setPlaybackRate(playbackRate);
      } catch {
        // ignore
      }
    }
  }, [playbackRate]);

  // ─── Controls ────────────────────────────────────────

  const togglePlay = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;

    try {
      const state = player.getPlayerState();
      if (state === YT_STATES.PLAYING) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
    } catch {
      // ignore
    }
  }, []);

  const seekTo = useCallback(
    (posMs: number) => {
      const player = playerRef.current;
      if (!player || !isReadyRef.current) return;

      seekingRef.current = true;
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);

      try {
        player.seekTo(posMs / 1000, true);
        setPosition(posMs);
      } catch {
        // ignore
      }

      seekDebounceRef.current = setTimeout(() => {
        seekingRef.current = false;
      }, 400);
    },
    [setPosition],
  );

  const play = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;
    try {
      player.playVideo();
    } catch {
      // ignore
    }
  }, []);

  const pause = useCallback(() => {
    const player = playerRef.current;
    if (!player || !isReadyRef.current) return;
    try {
      player.pauseVideo();
    } catch {
      // ignore
    }
  }, []);

  // ─── Cleanup on unmount ──────────────────────────────

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (seekDebounceRef.current) clearTimeout(seekDebounceRef.current);
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    containerRef,
    initPlayer,
    togglePlay,
    seekTo,
    play,
    pause,
    ytReady,
  };
}
