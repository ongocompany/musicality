'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  getCountInfo,
  type DanceStyle,
  type Section,
} from '@/utils/beat-counter';
import { getPhraseColor } from '@/utils/phrase-detector';

interface CountDisplayProps {
  positionMs: number;
  beats: number[];
  downbeats: number[];
  offsetBeatIndex: number | null;
  danceStyle: DanceStyle;
  sections?: Section[];
  bpm?: number;
  phraseIndex?: number;
  className?: string;
}

/**
 * Dance count display: large count number (1-8) + phrase number + BPM.
 * Color matches the current phrase color from PhraseGrid.
 */
export function CountDisplay({
  positionMs,
  beats,
  downbeats,
  offsetBeatIndex,
  danceStyle,
  sections,
  bpm,
  phraseIndex,
  className,
}: CountDisplayProps) {
  const countInfo = useMemo(
    () => getCountInfo(positionMs, beats, downbeats, offsetBeatIndex, danceStyle, sections),
    [positionMs, beats, downbeats, offsetBeatIndex, danceStyle, sections],
  );

  if (!countInfo) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-4', className)}>
        <span className="text-6xl font-bold text-muted-foreground/30">—</span>
        <span className="text-xs text-muted-foreground mt-1">Waiting for beat...</span>
      </div>
    );
  }

  const { count } = countInfo;
  const phraseColor = phraseIndex != null ? getPhraseColor(phraseIndex) : 'hsl(var(--primary))';

  return (
    <div className={cn('flex flex-col items-center justify-center py-3', className)}>
      {/* Phrase number */}
      {phraseIndex != null && (
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground mb-1">
          Phrase {phraseIndex + 1}
        </span>
      )}

      {/* Large count number */}
      <div
        className="flex items-center justify-center w-24 h-24 rounded-2xl transition-colors duration-75"
        style={{ backgroundColor: `${phraseColor}22` }}
      >
        <span
          className="text-7xl font-black tabular-nums leading-none transition-colors duration-75"
          style={{ color: phraseColor }}
        >
          {count}
        </span>
      </div>

      {/* 8-count dots */}
      <div className="flex gap-1.5 mt-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <div
            key={n}
            className="w-2 h-2 rounded-full transition-colors duration-75"
            style={{
              backgroundColor: n <= count ? phraseColor : 'hsl(var(--muted-foreground) / 0.2)',
              boxShadow: n === count ? `0 0 0 3px ${phraseColor}44` : undefined,
            }}
          />
        ))}
      </div>

      {/* BPM + style */}
      <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
        {bpm && <span>{Math.round(bpm)} BPM</span>}
        <span className="capitalize">{danceStyle.replace('-', ' ')}</span>
      </div>
    </div>
  );
}
