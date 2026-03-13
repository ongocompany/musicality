'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { LocalTrack, Folder, SortField, SortOrder, MediaType } from '@/stores/web-player-store';

type MediaTab = 'audio' | 'video' | 'youtube';

const ACCEPTED_AUDIO = '.mp3,.m4a,.wav,.ogg,.flac,.aac,.wma,.opus';
const ACCEPTED_VIDEO = '.mp4,.mov,.webm,.mkv';
const ACCEPTED_ALL = `${ACCEPTED_AUDIO},${ACCEPTED_VIDEO}`;

const TABS: { key: MediaTab; label: string }[] = [
  { key: 'audio', label: 'Songs' },
  { key: 'video', label: 'Videos' },
  { key: 'youtube', label: 'YouTube' },
];

const SORT_LABELS: Record<SortField, string> = {
  addedAt: 'Date Added',
  title: 'Name',
  bpm: 'BPM',
  duration: 'Duration',
};

const SORT_FIELDS: SortField[] = ['addedAt', 'title', 'bpm', 'duration'];

interface PlayerSidebarProps {
  tracks: LocalTrack[];
  currentTrack: LocalTrack | null;
  isPlaying: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onSelectTrack: (track: LocalTrack) => void;
  onAddFiles: (files: FileList | File[]) => void;
  onAddYouTube: (url: string) => void;
  onRemoveTrack: (id: string) => void;
  onAnalyze: (track: LocalTrack) => void;
  onSyncTrack: (track: LocalTrack) => void;
  onSyncAll: () => void;
  onLoadFromCloud: () => void;
  syncStatus: string;
  // Folders
  folders: Folder[];
  onCreateFolder: (name: string, mediaType: MediaType) => string;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onMoveTracksToFolder: (trackIds: string[], folderId: string | undefined) => void;
  // Sorting
  sortBy: SortField;
  sortOrder: SortOrder;
  onSetSortBy: (field: SortField) => void;
  onSetSortOrder: (order: SortOrder) => void;
}

export function PlayerSidebar({
  tracks,
  currentTrack,
  isPlaying,
  isOpen,
  onToggle,
  onSelectTrack,
  onAddFiles,
  onAddYouTube,
  onRemoveTrack,
  onAnalyze,
  onSyncTrack,
  onSyncAll,
  onLoadFromCloud,
  syncStatus,
  folders,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveTracksToFolder,
  sortBy,
  sortOrder,
  onSetSortBy,
  onSetSortOrder,
}: PlayerSidebarProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('audio');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState<string | null>(null);
  const [moveMenuTrackId, setMoveMenuTrackId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Folders for the current tab
  const tabFolders = useMemo(
    () => folders.filter((f) => f.mediaType === activeTab),
    [folders, activeTab],
  );

  // Sort tracks
  const sortTracks = useCallback(
    (list: LocalTrack[]) => {
      const sorted = [...list].sort((a, b) => {
        switch (sortBy) {
          case 'title':
            return a.title.localeCompare(b.title);
          case 'bpm': {
            const aBpm = a.analysis?.bpm ?? 0;
            const bBpm = b.analysis?.bpm ?? 0;
            return aBpm - bBpm;
          }
          case 'duration': {
            const aDur = a.duration ?? 0;
            const bDur = b.duration ?? 0;
            return aDur - bDur;
          }
          case 'addedAt':
          default: {
            const aAt = a.addedAt ?? 0;
            const bAt = b.addedAt ?? 0;
            return aAt - bAt;
          }
        }
      });
      return sortOrder === 'desc' ? sorted.reverse() : sorted;
    },
    [sortBy, sortOrder],
  );

  // Filtered & sorted tracks
  const { displayTracks, folderTrackCounts } = useMemo(() => {
    const tabTracks = tracks.filter((t) => t.mediaType === activeTab);
    const sorted = sortTracks(tabTracks);

    // Count tracks per folder
    const fCounts = new Map<string, number>();
    for (const t of sorted) {
      if (t.folderId) fCounts.set(t.folderId, (fCounts.get(t.folderId) ?? 0) + 1);
    }

    // Display tracks based on folder navigation
    let display: LocalTrack[];
    if (currentFolderId) {
      display = sorted.filter((t) => t.folderId === currentFolderId);
    } else {
      // Root view: show only uncategorized tracks
      display = sorted.filter((t) => !t.folderId);
    }

    return { displayTracks: display, folderTrackCounts: fCounts };
  }, [tracks, activeTab, sortTracks, currentFolderId]);

  const currentFolder = currentFolderId
    ? folders.find((f) => f.id === currentFolderId)
    : null;

  // ─── Handlers ────────────────────────────────────

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

  const handleCreateFolder = useCallback(() => {
    const name = window.prompt('New folder name:');
    if (!name?.trim()) return;
    onCreateFolder(name.trim(), activeTab);
  }, [onCreateFolder, activeTab]);

  const handleSortPress = useCallback(
    (field: SortField) => {
      if (sortBy === field) {
        onSetSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        onSetSortBy(field);
        onSetSortOrder(field === 'title' ? 'asc' : 'desc');
      }
      setSortMenuOpen(false);
    },
    [sortBy, sortOrder, onSetSortBy, onSetSortOrder],
  );

  const handleFolderAction = useCallback(
    (action: 'rename' | 'delete', folderId: string) => {
      setFolderMenuOpen(null);
      if (action === 'rename') {
        const folder = folders.find((f) => f.id === folderId);
        const name = window.prompt('Rename folder:', folder?.name ?? '');
        if (name?.trim()) onRenameFolder(folderId, name.trim());
      } else {
        if (window.confirm('Delete this folder? Tracks will be moved to root.')) {
          if (currentFolderId === folderId) setCurrentFolderId(null);
          onDeleteFolder(folderId);
        }
      }
    },
    [folders, currentFolderId, onRenameFolder, onDeleteFolder],
  );

  const handleMoveToFolder = useCallback(
    (trackId: string, folderId: string | undefined) => {
      onMoveTracksToFolder([trackId], folderId);
      setMoveMenuTrackId(null);
    },
    [onMoveTracksToFolder],
  );

  const handleTabChange = useCallback((tab: MediaTab) => {
    setActiveTab(tab);
    setCurrentFolderId(null);
  }, []);

  // ─── Render ────────────────────────────────────

  const trackCount = tracks.length;

  return (
    <div className="relative shrink-0 h-full flex">
      {/* Sliding panel */}
      <div
        className={cn(
          'w-80 border-r border-border bg-card flex flex-col h-full transition-[margin] duration-300 ease-in-out',
          !isOpen && '-ml-80',
        )}
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
              onClick={() => handleTabChange(tab.key)}
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

      {/* Toolbar: Sort + New Folder + Folder breadcrumb */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border text-[11px]">
        {currentFolder ? (
          <>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setCurrentFolderId(null)}
              title="Back to root"
            >
              ←
            </button>
            <span className="text-foreground font-medium truncate flex-1">
              📁 {currentFolder.name}
            </span>
          </>
        ) : (
          <>
            {/* Sort button */}
            <div className="relative">
              <button
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                onClick={() => setSortMenuOpen(!sortMenuOpen)}
              >
                {SORT_LABELS[sortBy]}
                <span className="text-[9px]">{sortOrder === 'asc' ? '↑' : '↓'}</span>
              </button>
              {sortMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setSortMenuOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
                    {SORT_FIELDS.map((field) => (
                      <button
                        key={field}
                        className={cn(
                          'block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors',
                          sortBy === field && 'bg-primary/10 text-primary font-medium',
                        )}
                        onClick={() => handleSortPress(field)}
                      >
                        {SORT_LABELS[field]}
                        {sortBy === field && (
                          <span className="ml-1">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex-1" />
            {/* New folder button */}
            <button
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleCreateFolder}
              title="New folder"
            >
              + 📁
            </button>
          </>
        )}
      </div>

      {/* Drop overlay */}
      {dragOver && (
        <div className="px-3 py-2 text-center text-xs text-primary bg-primary/5 border-b border-primary/20">
          Drop files to add
        </div>
      )}

      {/* Folder list + Track list */}
      <div className="flex-1 overflow-y-auto">
        {/* Folders (only in root view) */}
        {!currentFolderId && tabFolders.length > 0 && (
          <div className="border-b border-border">
            {tabFolders.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50 relative"
                onClick={() => setCurrentFolderId(folder.id)}
              >
                <span className="text-sm">📁</span>
                <span className="flex-1 text-xs truncate">{folder.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {folderTrackCounts.get(folder.id) ?? 0}
                </span>
                <button
                  className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderMenuOpen(folderMenuOpen === folder.id ? null : folder.id);
                  }}
                  title="Folder options"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
                {/* Folder context menu */}
                {folderMenuOpen === folder.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => { e.stopPropagation(); setFolderMenuOpen(null); }}
                    />
                    <div className="absolute right-3 top-full z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[100px]">
                      <button
                        className="block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleFolderAction('rename', folder.id); }}
                      >
                        Rename
                      </button>
                      <button
                        className="block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent text-destructive transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleFolderAction('delete', folder.id); }}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Track list */}
        {displayTracks.length === 0 && (currentFolderId || tabFolders.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <span className="text-2xl mb-2">
              {activeTab === 'audio' ? '🎵' : activeTab === 'video' ? '🎬' : '▶'}
            </span>
            <p className="text-xs">
              {currentFolderId
                ? 'This folder is empty'
                : activeTab === 'youtube'
                  ? 'Paste a YouTube URL above'
                  : 'Drop files or click Add'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayTracks.map((track) => (
              <div
                key={track.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors hover:bg-accent/50 relative group',
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
                  {/* Move to folder */}
                  <button
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoveMenuTrackId(moveMenuTrackId === track.id ? null : track.id);
                    }}
                    title="Move to folder"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
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

                {/* Move-to-folder menu */}
                {moveMenuTrackId === track.id && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={(e) => { e.stopPropagation(); setMoveMenuTrackId(null); }}
                    />
                    <div className="absolute right-3 top-full z-50 bg-popover border border-border rounded-lg shadow-lg p-1 min-w-[130px]">
                      {/* Root option */}
                      <button
                        className={cn(
                          'block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors',
                          !track.folderId && 'bg-primary/10 text-primary font-medium',
                        )}
                        onClick={(e) => { e.stopPropagation(); handleMoveToFolder(track.id, undefined); }}
                      >
                        Root
                      </button>
                      {tabFolders.map((folder) => (
                        <button
                          key={folder.id}
                          className={cn(
                            'block w-full text-left px-3 py-1.5 text-xs rounded hover:bg-accent transition-colors',
                            track.folderId === folder.id && 'bg-primary/10 text-primary font-medium',
                          )}
                          onClick={(e) => { e.stopPropagation(); handleMoveToFolder(track.id, folder.id); }}
                        >
                          📁 {folder.name}
                        </button>
                      ))}
                      {tabFolders.length === 0 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground">
                          No folders yet
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      {/* Toggle handle */}
      <button
        onClick={onToggle}
        className={cn(
          'h-full w-6 flex items-center justify-center',
          'bg-card/80 hover:bg-accent/80 border-r border-border',
          'transition-colors duration-200 cursor-pointer shrink-0',
          'focus:outline-none',
        )}
        title={isOpen ? 'Hide playlist' : 'Show playlist'}
        aria-label={isOpen ? 'Hide playlist' : 'Show playlist'}
      >
        <div className="flex flex-col items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn(
              'text-muted-foreground transition-transform duration-300',
              !isOpen && 'rotate-180',
            )}
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {!isOpen && trackCount > 0 && (
            <span className="text-[9px] text-muted-foreground font-medium leading-none">
              {trackCount}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
