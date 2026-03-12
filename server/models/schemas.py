from pydantic import BaseModel


class SectionInfo(BaseModel):
    label: str              # "intro" | "derecho" | "majao" | "mambo" | "bridge" | "outro"
    start_time: float       # section start in seconds
    end_time: float         # section end in seconds
    confidence: float       # classification confidence 0-1


class AnalysisResult(BaseModel):
    bpm: float
    beats: list[float]          # beat timestamps in seconds
    downbeats: list[float]      # downbeat (beat 1) timestamps in seconds
    duration: float             # track duration in seconds
    beats_per_bar: int          # typically 4 for 4/4 time
    confidence: float           # analysis confidence 0-1
    sections: list[SectionInfo] = []  # music structure sections (backward compatible)
    phrase_boundaries: list[float] = []  # phrase boundary timestamps in seconds (auto-detected)
    waveform_peaks: list[float] = []  # 200 normalized amplitude peaks (0.0-1.0) for visualization
    fingerprint: str = ""  # Chromaprint audio fingerprint for track identification


class HealthResponse(BaseModel):
    status: str
    version: str
