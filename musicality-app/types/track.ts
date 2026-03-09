import { AnalysisResult, AnalysisStatus } from './analysis';

export type MediaType = 'audio' | 'video' | 'youtube';

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
  analysis?: AnalysisResult;
  analysisStatus: AnalysisStatus;
}
