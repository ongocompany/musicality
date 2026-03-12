'use client';

import { useState, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LocalTrack } from '@/stores/web-player-store';

type MediaTab = 'audio' | 'video' | 'youtube';

const ACCEPTED_AUDIO = '.mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus';
const ACCEPTED_VIDEO = '.mp4,.mov,.webm,.mkv';
const ACCEPTED_ALL = `${ACCEPTED_AUDIO},${ACCEPTED_VIDEO}`;

const TABS: { key: MediaTab; label: string }[] = [
  { key: 'audio', label: 'Songs' },
  { key: 'video', label: 'Videos' },
  { key: 'youtube', label: 'YouTube' },
];

interface PlayerSidebarProps {
  tracks: LocalTrack[];
  currentTrack: LocalTrack | null;
  isPlaying: boolean;
  onSelectTrack: (track: LocalTrack) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onAddYouTube: (url: string) => void;
  onRemoveTrack: (id: string) => void;
  onAnalyze: (track: LocalTrack) => void;
  onSyncTrack: (track: LocalTrack) => void;
  onSyncAll: () => void;
  onLoadFromCloud: () => void;
  syncStatus: string;
}

export function PlayerSidebar({
  tracks,
  currentTrack,
  isPlaying,
  onSelectTrack,
  onAddFiles,
  onAddYouTube,
  onRemoveTrack,
  onAnalyze,
  onSyncTrack,
  onSyncAll,
  onLoadFromCloud,
  syncStatus,
}: PlayerSidebarProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('audio');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredTracks = tracks.filter((t) => t.mediaType === activeTab);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        onAddFiles(e.dataTransfer.files);
      }
    },
    [onAddFiles],
  );

  const handleYouTubeSubmit = useCallback(() => {
    if (!youtubeUrl.trim()) return;
    onAddYouTube(youtubeUrl.trim());
    setYoutubeUrl('');
  }, [youtubeUrl, onAddYouTube]);

  return (
    <div
      className="w-80 shrink-0 border-r border-border bg-card flex flex-col h-full"
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
    >
      {/* Header actions */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={() => fileInputRef.current?.click()}
          >
            + Add Files
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs px-2"
            onClick={onSyncAll}
            disabled={syncStatus === 'syncing'}
            title="Upload all analyzed tracks to cloud"
          >
            {syncStatus === 'syncing' ? '...' : '↑'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs px-2"
            onClick={onLoadFromCloud}
            disabled={syncStatus === 'syncing'}
            title="Load tracks from cloud"
          >
            {syncStatus === 'syncing' ? '...' : '↓'}
          </Button>
        </div>

        {/* YouTube URL input */}
        <div className="flex gap-1.5">
          <input
            type="text"
            placeholder="YouTube URL..."
            className="flex-1 border border-border rounded-md px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleYouTubeSubmit(); }}
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs px-2 h-7"
            onClick={handleYouTubeSubmit}
            disabled={!youtubeUrl.trim()}
          >
            +
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_ALL}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) onAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {TABS.map((tab) => {
          const count = tracks.filter((t) => t.mediaType === tab.key).length;
          return (
            <button
              key={tab.key}
              className={cn(
                'flex-1 py-2 text-xs font-medium transition-colors relative',
                activeTab === tab.key
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {count}
                </span>
              )}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div className="px-3 py-2 text-center text-xs text-primary bg-primary/5 border-b border-primary/20">
          Drop files to add
        </div>
      )}

      {/* Track list */}
      <div className="flex-1 overflow-y-auto">
        {filteredTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <span className="text-2xl mb-2">
              {activeTab === 'audio' ? '🎵' : activeTab === 'video' ? '🎬' : '▶'}
            </span>
            <p className="text-xs">
              {activeTab === 'youtube' ? 'Paste a YouTube URL above' : 'Drop files or click Add'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredTracks.map((track) => (
              <div
                key={track.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50',
                  currentTrack?.id === track.id && 'bg-primary/5',
                )}
                onClick={() => onSelectTrack(track)}
              >
                {/* Play indicator */}
                <div className="w-4 text-center shrink-0">
                  {currentTrack?.id === track.id && isPlaying ? (
                    <span className="text-primary text-xs">▶</span>
                  ) : currentTrack?.id === track.id ? (
                    <span className="text-primary text-xs">❚❚</span>
                  ) : (
                    <span className="text-muted-foreground text-[10px]">
                      {track.mediaType === 'youtube' ? '▶' : track.mediaType === 'video' ? '🎬' : '🎵'}
                    </span>
                  )}
                </div>

                {/* Track info */}
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-xs truncate',
                      currentTrack?.id === track.id
                        ? 'text-primary font-medium'
                        : 'text-foreground',
                    )}
                  >
                    {track.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {track.format?.toUpperCase()}
                    {track.fileSize
                      ? ` · ${(track.fileSize / (1024 * 1024)).toFixed(1)}MB`
                      : ''}
                    {track.analysis ? ` · ${Math.round(track.analysis.bpm)} BPM` : ''}
                    {track.analysisStatus === 'analyzing' && ' · Analyzing...'}
                    {track.remoteTrack ? ' · ☁️' : ''}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {track.analysisStatus === 'idle' && track.file && (
                    <button
                      className="p-1 text-muted-foreground hover:text-primary transition-colors"
                      onClick={(e) => { e.stopPropagation(); onAnalyze(track); }}
                      title="Analyze"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </button>
                  )}
                  {track.analysisStatus === 'done' && (
                    <span className="text-[10px] text-green-500 px-1">✓</span>
                  )}
                  {track.analysis && !track.remoteTrack && (
                    <button
                      className="p-1 text-muted-foreground hover:text-blue-500 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onSyncTrack(track); }}
                      title="Sync to cloud"
                    >
                      <span className="text-[10px]">☁️</span>
                    </button>
                  )}
                  <button
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={(e) => { e.stopPropagation(); onRemoveTrack(track.id); }}
                    title="Remove"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
