from pydantic import BaseModel


class AnalysisResult(BaseModel):
    bpm: float
    beats: list[float]          # beat timestamps in seconds
    downbeats: list[float]      # downbeat (beat 1) timestamps in seconds
    duration: float             # track duration in seconds
    beats_per_bar: int          # typically 4 for 4/4 time
    confidence: float           # analysis confidence 0-1


class HealthResponse(BaseModel):
    status: str
    version: str
