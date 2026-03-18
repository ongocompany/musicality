import { useRef, useEffect, useCallback } from 'react';

const DEFAULT_DEBOUNCE_MS = 500;

export function useAutoSave(
  saveFn: () => void,
  dependencies: any[],
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
  enabled: boolean = true,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Skip first render to avoid saving on mount
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!enabled) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveFn();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, dependencies);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    saveFn();
  }, [saveFn]);

  const cancel = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { saveNow, cancel };
}
