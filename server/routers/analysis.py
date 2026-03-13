import os
import uuid
import shutil
import logging
import threading
import time
import traceback
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

from models.schemas import AnalysisResult
from services.beat_analyzer import analyze_audio
from services.analysis_cache import (
    compute_file_hash, compute_fingerprint,
    lookup_cache, lookup_cache_by_fingerprint, store_in_cache,
)

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".mp4", ".mov"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

# ── Async job store (in-memory, single worker) ──────────────────

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
JOB_EXPIRY_SECONDS = 3600  # Clean up after 1 hour


def _cleanup_old_jobs():
    """Remove jobs older than JOB_EXPIRY_SECONDS."""
    now = time.time()
    with _jobs_lock:
        expired = [jid for jid, j in _jobs.items()
                   if now - j["created_at"] > JOB_EXPIRY_SECONDS]
        for jid in expired:
            # Clean up file if still exists
            job_data = _jobs[jid]
            fp = job_data.get("file_path")
            if fp and Path(fp).exists():
                try:
                    Path(fp).unlink()
                except Exception:
                    pass
            del _jobs[jid]


def _run_analysis_background(job_id: str, file_path: Path,
                             file_hash: str, file_size: int, filename: str):
    """Background thread: runs full analysis and updates job status."""
    try:
        logger.info(f"[Job {job_id[:8]}] Starting analysis for {filename}...")
        result = analyze_audio(str(file_path))
        result.file_hash = file_hash
        store_in_cache(file_hash, file_size, result)

        with _jobs_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["result"] = result.model_dump()

        logger.info(f"[Job {job_id[:8]}] Analysis complete for {filename}")

    except Exception as e:
        logger.error(f"[Job {job_id[:8]}] Analysis failed: {e}")
        logger.error(traceback.format_exc())
        with _jobs_lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(e)
    finally:
        if file_path.exists():
            file_path.unlink()


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_track(file: UploadFile = File(...)):
    """
    Upload audio and analyze beats.
    - Cache HIT → 200 with AnalysisResult (instant)
    - Cache MISS → 202 with {job_id, status} (async, poll /analyze/status/{job_id})
    """
    # Periodic cleanup
    _cleanup_old_jobs()

    # Validate extension
    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Save to disk
    secure_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / secure_name

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = file_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            file_path.unlink()
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({file_size // (1024*1024)}MB). Max: {MAX_FILE_SIZE // (1024*1024)}MB",
            )
        if file_size == 0:
            file_path.unlink()
            raise HTTPException(status_code=400, detail="Empty file")

        # ── Tier 1: SHA-256 hash (exact file match, ~200ms) ──
        file_hash = compute_file_hash(str(file_path))
        cached = lookup_cache(file_hash)
        if cached is not None:
            logger.info(f"Cache HIT (hash) for {filename}")
            file_path.unlink()
            return cached  # 200 OK

        # ── Tier 2: Fingerprint (same song, different file, ~1-2s) ──
        try:
            fp_duration, fp_string = compute_fingerprint(str(file_path))
            cached = lookup_cache_by_fingerprint(fp_string, fp_duration)
            if cached is not None:
                logger.info(f"Cache HIT (fingerprint) for {filename}")
                cached.file_hash = file_hash
                store_in_cache(file_hash, file_size, cached)
                file_path.unlink()
                return cached  # 200 OK
        except Exception as e:
            logger.warning(f"Fingerprint lookup failed: {e}")

        # ── Tier 3: Async analysis ──
        job_id = str(uuid.uuid4())
        with _jobs_lock:
            _jobs[job_id] = {
                "status": "processing",
                "result": None,
                "error": None,
                "created_at": time.time(),
                "filename": filename,
                "file_path": str(file_path),
            }

        thread = threading.Thread(
            target=_run_analysis_background,
            args=(job_id, file_path, file_hash, file_size, filename),
            daemon=True,
        )
        thread.start()

        logger.info(f"[Job {job_id[:8]}] Queued async analysis for {filename}")

        return JSONResponse(
            status_code=202,
            content={"job_id": job_id, "status": "processing"},
        )

    except HTTPException:
        raise
    except Exception as e:
        if file_path.exists():
            file_path.unlink()
        logger.error(f"Analysis failed for {filename}: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/analyze/status/{job_id}")
async def get_analysis_status(job_id: str):
    """
    Poll analysis job status.
    - processing → {status: "processing"}
    - done → {status: "done", result: AnalysisResult}
    - error → {status: "error", error: "..."}
    """
    with _jobs_lock:
        job = _jobs.get(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")

    if job["status"] == "done":
        return {"status": "done", "result": job["result"]}
    elif job["status"] == "error":
        return {"status": "error", "error": job["error"]}
    else:
        return {"status": "processing"}
