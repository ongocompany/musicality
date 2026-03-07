import { AnalysisResult, AnalysisStatus } from './analysis';

export interface Track {
  id: string;
  title: string;
  uri: string;
  fileSize: number;
  format: string;
  duration?: number;
  importedAt: number; // timestamp ms
  analysis?: AnalysisResult;
  analysisStatus: AnalysisStatus;
}
