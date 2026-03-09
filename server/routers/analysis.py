import os
import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from models.schemas import AnalysisResult
from services.beat_analyzer import analyze_audio

router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".mp4", ".mov"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_track(file: UploadFile = File(...)):
    """
    Upload an audio file and analyze its beats, downbeats, and BPM.
    Supports: mp3, wav, flac, m4a, aac, ogg
    """

    # Validate file extension
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Generate secure temp filename
    secure_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / secure_name

    try:
        # Save uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Check file size
        file_size = file_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({file_size // (1024*1024)}MB). Max: {MAX_FILE_SIZE // (1024*1024)}MB",
            )

        if file_size == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        # Run analysis
        result = analyze_audio(str(file_path))
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        # Clean up temp file
        if file_path.exists():
            file_path.unlink()
