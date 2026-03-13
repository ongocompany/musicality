'use client';

import { useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { getPhraseColor, type PhraseMap } from '@/utils/phrase-detector';

interface WaveformBarProps {
  peaks: number[];
  progress: number;        // 0-1
  duration: number;        // ms
  loopStart?: number | null; // ms
  loopEnd?: number | null;   // ms
  phraseMap?: PhraseMap | null;
  onSeek: (posMs: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  className?: string;
}

/**
 * Waveform visualization with interactive seek.
 * Renders peaks as vertical bars with progress coloring.
 * Shows phrase segments as colored bands below the waveform.
 */
export function WaveformBar({
  peaks,
  progress,
  duration,
  loopStart,
  loopEnd,
  phraseMap,
  onSeek,
  onSeekStart,
  onSeekEnd,
  className,
}: WaveformBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const positionFromClientX = useCallback(
    (clientX: number): number => {
      const el = containerRef.current;
      if (!el || duration <= 0) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      onSeekStart?.();
      onSeek(positionFromClientX(e.clientX));

      const onMouseMove = (ev: MouseEvent) => {
        onSeek(positionFromClientX(ev.clientX));
      };
      const onMouseUp = (ev: MouseEvent) => {
        onSeek(positionFromClientX(ev.clientX));
        onSeekEnd?.();
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onSeek, onSeekStart, onSeekEnd, positionFromClientX],
  );

  if (peaks.length === 0) return null;

  // Downsample peaks to max ~200 bars for performance
  const maxBars = 200;
  const step = Math.max(1, Math.floor(peaks.length / maxBars));
  const displayPeaks: number[] = [];
  for (let i = 0; i < peaks.length; i += step) {
    let max = 0;
    for (let j = i; j < Math.min(i + step, peaks.length); j++) {
      if (peaks[j] > max) max = peaks[j];
    }
    displayPeaks.push(max);
  }

  // Normalize
  const maxPeak = Math.max(...displayPeaks, 0.01);

  // Loop range as ratios
  const loopStartRatio = loopStart != null && duration > 0 ? loopStart / duration : null;
  const loopEndRatio = loopEnd != null && duration > 0 ? loopEnd / duration : null;

  // Phrase segments
  const phraseSegments = phraseMap && duration > 0
    ? phraseMap.phrases.map((phrase, i) => ({
        left: (phrase.startTime * 1000) / duration,
        width: ((phrase.endTime - phrase.startTime) * 1000) / duration,
        color: getPhraseColor(phrase.index),
      }))
    : [];

  return (
    <div className="space-y-0.5">
      <div
        ref={containerRef}
        className={cn(
          'relative h-16 cursor-pointer select-none rounded-lg overflow-hidden bg-muted/30',
          className,
        )}
        onMouseDown={handleMouseDown}
      >
        {/* Loop range background */}
        {loopStartRatio != null && loopEndRatio != null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/10"
            style={{
              left: `${loopStartRatio * 100}%`,
              width: `${(loopEndRatio - loopStartRatio) * 100}%`,
            }}
          />
        )}

        {/* Bars */}
        <div className="absolute inset-0 flex items-end gap-px px-px">
          {displayPeaks.map((peak, i) => {
            const ratio = i / displayPeaks.length;
            const isPast = ratio <= progress;
            const height = Math.max(2, (peak / maxPeak) * 100);

            return (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-colors duration-75"
                style={{
                  height: `${height}%`,
                  backgroundColor: isPast
                    ? 'hsl(var(--primary))'
                    : 'hsl(var(--muted-foreground) / 0.3)',
                }}
              />
            );
          })}
        </div>

        {/* Playhead line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-sm z-10"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      {/* Phrase segment bar */}
      {phraseSegments.length > 0 && (
        <div className="relative h-16 rounded-lg overflow-hidden bg-muted/20 cursor-pointer" onMouseDown={handleMouseDown}>
          {phraseSegments.map((seg, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 transition-opacity"
              style={{
                left: `${seg.left * 100}%`,
                width: `${seg.width * 100}%`,
                backgroundColor: seg.color,
                opacity: 0.6,
              }}
            />
          ))}
          {/* Playhead on segment bar */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground z-10"
            style={{ left: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
