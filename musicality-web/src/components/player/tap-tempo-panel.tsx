'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTapTempo } from '@/hooks/use-tap-tempo';

/**
 * Tap Tempo Panel — compact inline panel for the player page.
 * Features: TAP button (click/keyboard), BPM display, ±1 adjust,
 * manual BPM input, Apply button to generate beats.
 */

interface TapTempoPanelProps {
  /** Called when user confirms the BPM — apply synthetic beats */
  onApplyBpm: (bpm: number) => void;
  /** Current analysis BPM (if any), shown as reference */
  currentBpm?: number | null;
  /** Whether the panel is expanded */
  expanded: boolean;
  /** Toggle expanded state */
  onToggle: () => void;
}

export function TapTempoPanel({
  onApplyBpm,
  currentBpm,
  expanded,
  onToggle,
}: TapTempoPanelProps) {
  const { phase, bpm, tapCount, recordTap, adjustBpm, setManualBpm, reset } =
    useTapTempo();

  const [manualInput, setManualInput] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [tapPulse, setTapPulse] = useState(false);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // ─── Keyboard tap (T key) ───────────────────────────

  useEffect(() => {
    if (!expanded) return;

    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;

      if (e.code === 'KeyT' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        recordTap();
        // Visual pulse
        setTapPulse(true);
        setTimeout(() => setTapPulse(false), 150);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [expanded, recordTap]);

  // ─── Handle TAP click ──────────────────────────────

  const handleTapClick = useCallback(() => {
    recordTap();
    setTapPulse(true);
    setTimeout(() => setTapPulse(false), 150);
  }, [recordTap]);

  // ─── Handle manual BPM submit ──────────────────────

  const handleManualSubmit = useCallback(() => {
    const value = parseFloat(manualInput);
    if (!isNaN(value) && value >= 60 && value <= 220) {
      setManualBpm(value);
      setShowManualInput(false);
      setManualInput('');
    }
  }, [manualInput, setManualBpm]);

  // ─── Apply BPM ─────────────────────────────────────

  const handleApply = useCallback(() => {
    if (bpm !== null) {
      onApplyBpm(bpm);
    }
  }, [bpm, onApplyBpm]);

  // ─── Focus manual input on show ────────────────────

  useEffect(() => {
    if (showManualInput && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showManualInput]);

  // ─── Status message ─────────────────────────────────

  const statusText = (() => {
    switch (phase) {
      case 'idle':
        return 'Tap the button or press T key';
      case 'tapping':
        return `Tapping... (${tapCount} taps, need ${4 - tapCount} more)`;
      case 'bpmSet':
        return 'BPM detected! Adjust or Apply';
      default:
        return '';
    }
  })();

  if (!expanded) {
    return (
      <button
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        onClick={onToggle}
      >
        <span>▶</span>
        <span>Tap Tempo</span>
        {currentBpm && (
          <span className="text-[10px] text-muted-foreground/70">
            ({Math.round(currentBpm)} BPM)
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/50 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          onClick={onToggle}
        >
          ▼ Tap Tempo
        </button>
        {phase !== 'idle' && (
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={reset}
          >
            Reset
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex items-center gap-4">
        {/* TAP button */}
        <button
          className={cn(
            'relative w-16 h-16 rounded-full font-bold text-sm transition-all duration-150 select-none',
            'focus:outline-none focus:ring-2 focus:ring-primary/50',
            phase === 'bpmSet'
              ? 'bg-green-500/90 text-white hover:bg-green-500 shadow-lg shadow-green-500/20'
              : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20',
            tapPulse && 'scale-95',
          )}
          onClick={handleTapClick}
        >
          TAP
          {/* Pulse ring */}
          {tapPulse && (
            <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-30" />
          )}
        </button>

        {/* BPM display + controls */}
        <div className="flex-1 space-y-1.5">
          {/* BPM value */}
          <div className="flex items-center gap-2">
            {bpm !== null ? (
              <>
                <span className="text-2xl font-bold tabular-nums">
                  {bpm.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">BPM</span>
              </>
            ) : (
              <span className="text-lg text-muted-foreground">— BPM</span>
            )}
          </div>

          {/* Adjust buttons (when BPM is set) */}
          {bpm !== null && (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => adjustBpm(-1)}
              >
                −
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => adjustBpm(-0.1)}
              >
                -.1
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => adjustBpm(0.1)}
              >
                +.1
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0 text-xs"
                onClick={() => adjustBpm(1)}
              >
                +
              </Button>
            </div>
          )}

          {/* Status */}
          <p className="text-[10px] text-muted-foreground">{statusText}</p>
        </div>

        {/* Right side: Manual input + Apply */}
        <div className="flex flex-col gap-1.5 items-end">
          {/* Manual BPM input toggle */}
          {!showManualInput ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-[10px] h-6 px-2"
              onClick={() => setShowManualInput(true)}
            >
              Manual
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                ref={manualInputRef}
                type="number"
                min={60}
                max={220}
                step={0.1}
                placeholder="BPM"
                className="w-16 h-6 text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualSubmit();
                  if (e.key === 'Escape') {
                    setShowManualInput(false);
                    setManualInput('');
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-1.5 text-[10px]"
                onClick={handleManualSubmit}
              >
                OK
              </Button>
            </div>
          )}

          {/* Apply button */}
          {bpm !== null && (
            <Button
              size="sm"
              className="h-7 px-3 text-xs font-medium"
              onClick={handleApply}
            >
              Apply {bpm.toFixed(1)} BPM
            </Button>
          )}
        </div>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-muted-foreground text-center">
        Press <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">T</kbd> key to tap
      </p>
    </div>
  );
}
