import { useRef, useEffect, useCallback } from 'react';
import { YoutubeIframeRef } from 'react-native-youtube-iframe';
import { usePlayerStore } from '../stores/playerStore';

/**
 * YouTube playback hook.
 *
 * The library's `play` prop uses webView.postMessage() internally,
 * which is unreliable on some RN WebView versions (message dispatched
 * on `document` instead of `window`).
 *
 * WORKAROUND: We patched the library to expose `playVideo()` and
 * `pauseVideo()` on the ref, using `injectJavaScript` (same mechanism
 * as seekTo — proven to work). Our togglePlay calls these directly.
 *
 * The `play` prop is still passed as a fallback sync mechanism.
 */
export function useYouTubePlayer() {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seekingRef = useRef(false);
  const isReadyRef = useRef(false);

  const {
    currentTrack,
    setIsPlaying,
    setPosition,
    setDuration,
  } = usePlayerStore();

  // ─── Position polling ──────────────────────────────
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      if (!playerRef.current || seekingRef.current || !isReadyRef.current) return;
      try {
        const store = usePlayerStore.getState();
        const timeSec = await playerRef.current.getCurrentTime();
        const posMs = Math.round(timeSec * 1000);

        if (!store.isSeeking) {
          setPosition(posMs);
        }

        // Re-fetch duration if it was 0
        if (store.duration === 0) {
          const dur = await playerRef.current.getDuration();
          if (dur > 0) setDuration(Math.round(dur * 1000));
        }

        // Loop logic
        if (
          store.loopEnabled &&
          store.loopStart !== null &&
          store.loopEnd !== null &&
          posMs >= store.loopEnd &&
          !seekingRef.current
        ) {
          seekingRef.current = true;
          try { playerRef.current.seekTo(store.loopStart / 1000, true); } catch {}
          setTimeout(() => { seekingRef.current = false; }, 300);
        }
      } catch {}
    }, 200);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ─── Player event handlers ────────────────────────
  const onReady = useCallback(async () => {
    isReadyRef.current = true;
    if (!playerRef.current) return;
    try {
      const dur = await playerRef.current.getDuration();
      if (dur > 0) setDuration(Math.round(dur * 1000));
    } catch {}
    startPolling();
  }, []);

  const onStateChange = useCallback((state: string) => {
    switch (state) {
      case 'playing':
        setIsPlaying(true);
        startPolling();
        break;
      case 'paused':
        setIsPlaying(false);
        break;
      case 'ended':
        setIsPlaying(false);
        stopPolling();
        break;
    }
  }, []);

  // ─── Controls ─────────────────────────────────────
  // Play/pause: use injectJavaScript via patched ref (reliable, unlike postMessage)
  const togglePlay = useCallback(() => {
    if (!playerRef.current || !isReadyRef.current) return;
    const store = usePlayerStore.getState();
    const next = !store.isPlaying;
    setIsPlaying(next);
    try {
      if (next) {
        (playerRef.current as any).playVideo();
      } else {
        (playerRef.current as any).pauseVideo();
      }
    } catch {}
    startPolling();
  }, []);

  // Seek: use library ref (it uses injectJavaScript internally)
  const seekTo = useCallback((posMs: number) => {
    if (!playerRef.current || !isReadyRef.current) return;
    const posSec = Math.max(0, posMs / 1000);
    seekingRef.current = true;
    setPosition(posMs);
    try { playerRef.current.seekTo(posSec, true); } catch {}
    setTimeout(() => { seekingRef.current = false; }, 400);
  }, []);

  // ─── Cleanup ──────────────────────────────────────
  useEffect(() => {
    return () => {
      stopPolling();
      isReadyRef.current = false;
    };
  }, [currentTrack?.id]);

  return {
    playerRef,
    togglePlay,
    seekTo,
    onReady,
    onStateChange,
  };
}
