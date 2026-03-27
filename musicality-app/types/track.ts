import { AnalysisResult, AnalysisStatus } from './analysis';

export type MediaType = 'audio' | 'video' | 'youtube';

export type SortField = 'importedAt' | 'title' | 'bpm' | 'duration';
export type SortOrder = 'asc' | 'desc';

export interface Folder {
  id: string;
  name: string;
  mediaType: MediaType;
  createdAt: number;
}

export interface Track {
  id: string;
  title: string;
  uri: string;
  fileSize: number;
  format: string;
  mediaType: MediaType;
  duration?: number;
  importedAt: number; // timestamp ms
  artist?: string; // ID3 artist tag
  album?: string; // ID3 album tag
  thumbnailUri?: string; // video thumbnail or album art (ID3 album art)
  folderId?: string; // undefined = root (uncategorized)
  analysis?: AnalysisResult;
  analysisStatus: AnalysisStatus;
  sourceUri?: string; // original picker URI for re-download if local copy is evicted
  fileBookmark?: string; // iOS: security-scoped bookmark (base64), Android: content:// URI
  pendingJobId?: string; // server job_id while analysis is in progress
  remoteId?: string; // Supabase player_tracks.id (set after cloud sync)
  cloudTrackId?: string; // Cloud Library track ID
}
