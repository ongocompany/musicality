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
  thumbnailUri?: string; // video thumbnail or album art
  folderId?: string; // undefined = root (uncategorized)
  analysis?: AnalysisResult;
  analysisStatus: AnalysisStatus;
}
