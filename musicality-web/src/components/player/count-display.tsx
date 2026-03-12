'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  getCountInfo,
  findCurrentSection,
  type DanceStyle,
  type CountInfo,
  type Section,
  type BeatType,
} from '@/utils/beat-counter';

// ─── Colors per count (rainbow scheme from mobile app) ───
const COUNT_COLORS: Record<number, string> = {
  1: 'text-red-500',
  2: 'text-orange-500',
  3: 'text-yellow-500',
  4: 'text-green-500',
  5: 'text-cyan-500',
  6: 'text-blue-500',
  7: 'text-purple-500',
  8: 'text-pink-500',
};

const COUNT_BG_COLORS: Record<number, string> = {
  1: 'bg-red-500/15',
  2: 'bg-orange-500/15',
  3: 'bg-yellow-500/15',
  4: 'bg-green-500/15',
  5: 'bg-cyan-500/15',
  6: 'bg-blue-500/15',
  7: 'bg-purple-500/15',
  8: 'bg-pink-500/15',
};

const BEAT_TYPE_LABEL: Record<BeatType, string> = {
  step: 'STEP',
  tap: 'TAP',
  pause: 'PAUSE',
};

const SECTION_LABEL: Record<string, string> = {
  intro: 'INTRO',
  derecho: 'DERECHO',
  majao: 'MAJAO',
  mambo: 'MAMBO',
  bridge: 'BRIDGE',
  outro: 'OUTRO',
};

interface CountDisplayProps {
  positionMs: number;
  beats: number[];
  downbeats: number[];
  offsetBeatIndex: number | null;
  danceStyle: DanceStyle;
  sections?: Section[];
  bpm?: number;
  className?: string;
}

/**
 * Dance count display: large count number (1-8) + beat type + section label + BPM.
 */
export function CountDisplay({
  positionMs,
  beats,
  downbeats,
  offsetBeatIndex,
  danceStyle,
  sections,
  bpm,
  className,
}: CountDisplayProps) {
  const countInfo = useMemo(
    () => getCountInfo(positionMs, beats, downbeats, offsetBeatIndex, danceStyle, sections),
    [positionMs, beats, downbeats, offsetBeatIndex, danceStyle, sections],
  );

  const currentSection = useMemo(
    () => (sections ? findCurrentSection(positionMs, sections) : null),
    [positionMs, sections],
  );

  if (!countInfo) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-4', className)}>
        <span className="text-6xl font-bold text-muted-foreground/30">—</span>
        <span className="text-xs text-muted-foreground mt-1">Waiting for beat...</span>
      </div>
    );
  }

  const { count, beatType } = countInfo;

  return (
    <div className={cn('flex flex-col items-center justify-center py-3', className)}>
      {/* Section label */}
      {currentSection && (
        <span className="text-[10px] font-medium tracking-widest uppercase text-muted-foreground mb-1">
          {SECTION_LABEL[currentSection.label] ?? currentSection.label}
        </span>
      )}

      {/* Large count number */}
      <div
        className={cn(
          'flex items-center justify-center w-24 h-24 rounded-2xl transition-colors duration-75',
          COUNT_BG_COLORS[count],
        )}
      >
        <span
          className={cn(
            'text-7xl font-black tabular-nums leading-none transition-colors duration-75',
            COUNT_COLORS[count],
          )}
        >
          {count}
        </span>
      </div>

      {/* Beat type */}
      <span
        className={cn(
          'text-xs font-semibold tracking-wider mt-1.5',
          beatType === 'tap'
            ? 'text-green-500'
            : beatType === 'pause'
              ? 'text-yellow-500'
              : 'text-muted-foreground',
        )}
      >
        {BEAT_TYPE_LABEL[beatType]}
      </span>

      {/* 8-count dots */}
      <div className="flex gap-1.5 mt-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <div
            key={n}
            className={cn(
              'w-2 h-2 rounded-full transition-colors duration-75',
              n <= count
                ? 'bg-primary'
                : 'bg-muted-foreground/20',
              n === count && 'ring-2 ring-primary/30',
            )}
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
