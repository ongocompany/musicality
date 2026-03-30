import os
import uuid
import shutil
import logging
import threading
import time
import traceback
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Query
from fastapi.responses import JSONResponse

from models.schemas import AnalysisResult
from services.beat_analyzer import analyze_audio
from services.beat_this_analyzer import analyze_audio_bt
from services.analysis_cache import (
    compute_file_hash, compute_fingerprint,
    lookup_cache, lookup_cache_by_fingerprint, store_in_cache,
)
from services.metadata_lookup import lookup_spotify

logger = logging.getLogger(__name__)

router = APIRouter()

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".mp4", ".mov"}


def _parse_artist_title(filename: str) -> tuple[str, str]:
    """Extract artist and title from upload filename. Returns (artist, title)."""
    stem = os.path.splitext(filename)[0]
    # Undo sanitization: underscores back to spaces
    stem = stem.replace("_", " ")
    if " - " in stem:
        parts = stem.split(" - ", 1)
        return parts[0].strip(), parts[1].strip()
    return "", stem.strip()
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB

# ── Async job store (in-memory, single worker) ──────────────────

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
JOB_EXPIRY_SECONDS = 3600  # Clean up after 1 hour

# ── Semaphore: limit concurrent analysis to prevent OOM ──────────
# Each analysis uses ~400MB (chunked mode). 3 concurrent = ~1.2GB peak.
# Without this, 10 concurrent = 4~5GB → server OOM/timeout.
# Threads are created immediately (user gets job_id fast), but actual
# analysis waits in queue until a slot opens.
MAX_CONCURRENT_ANALYSIS = 3
_analysis_semaphore = threading.Semaphore(MAX_CONCURRENT_ANALYSIS)


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
                             file_hash: str, file_size: int, filename: str,
                             engine: str | None = None):
    """
    Background thread: waits for semaphore slot, then runs analysis.
    Semaphore limits concurrent analysis to MAX_CONCURRENT_ANALYSIS (default 3)
    to prevent memory overload. Threads queue up and process in order.
    """
    try:
        # Wait for a slot — blocks until one of MAX_CONCURRENT_ANALYSIS slots is free
        logger.info(f"[Job {job_id[:8]}] Waiting for analysis slot ({MAX_CONCURRENT_ANALYSIS} max)...")
        _analysis_semaphore.acquire()
        logger.info(f"[Job {job_id[:8]}] Slot acquired, starting analysis for {filename}...")

        if engine == "bt":
            result = analyze_audio_bt(str(file_path))
        else:
            result = analyze_audio(str(file_path))
        result.file_hash = file_hash

        # Lookup album art via Spotify (non-blocking, best-effort)
        if not result.metadata:
            try:
                artist, title = _parse_artist_title(filename)
                if title:
                    meta = lookup_spotify(artist, title)
                    if meta:
                        from models.schemas import TrackMetadata
                        result.metadata = TrackMetadata(
                            title=meta.get("title"),
                            artist=meta.get("artist"),
                            album=meta.get("album"),
                            album_art_url=meta.get("album_art_url"),
                        )
                        logger.info(f"[Job {job_id[:8]}] Spotify art: {meta.get('album_art_url', 'none')[:60]}")
            except Exception as e:
                logger.debug(f"[Job {job_id[:8]}] Spotify lookup failed: {e}")

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
        _analysis_semaphore.release()  # Free slot for next queued job
        if file_path.exists():
            file_path.unlink()


# ── Endpoints ────────────────────────────────────────────────────

def _get_client_ip(request: Request) -> str:
    """Extract client IP from request (supports X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _has_active_job(client_ip: str) -> str | None:
    """Check if this client already has a processing job. Returns job_id or None."""
    with _jobs_lock:
        for jid, job in _jobs.items():
            if job.get("client_ip") == client_ip and job["status"] == "processing":
                return jid
    return None


@router.post("/analyze")
async def analyze_track(request: Request, file: UploadFile = File(...), engine: str | None = Query(default=None)):
    """
    Upload audio and analyze beats.
    - Cache HIT → 200 with AnalysisResult (instant)
    - Cache MISS → 202 with {job_id, status} (async, poll /analyze/status/{job_id})
    - Already processing → 429 with existing job_id
    """
    # Periodic cleanup
    _cleanup_old_jobs()

    # Rate limit: 1 concurrent analysis per client IP
    client_ip = _get_client_ip(request)
    existing_job = _has_active_job(client_ip)
    if existing_job:
        logger.info(f"[RateLimit] {client_ip} already has active job {existing_job[:8]}, rejecting")
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Analysis already in progress",
                "job_id": existing_job,
                "status": "processing",
            },
        )

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
        # Skip cache for alternative engines (A/B testing)
        file_hash = compute_file_hash(str(file_path))
        if engine:
            logger.info(f"Engine override '{engine}' — skipping cache for {filename}")
        cached = lookup_cache(file_hash) if not engine else None
        if cached is not None:
            # v2.3: re-run structure analysis if phrase_boundaries empty (stale cache)
            if not cached.phrase_boundaries and cached.beats and len(cached.beats) >= 8:
                logger.info(f"Cache HIT but stale phrases, re-analyzing structure for {filename}")
                try:
                    from services.structure_analyzer import analyze_structure_with_phrases
                    sections, phrase_boundaries = analyze_structure_with_phrases(
                        str(file_path), cached.duration, cached.beats, cached.downbeats
                    )
                    cached.sections = sections
                    cached.phrase_boundaries = phrase_boundaries
                    store_in_cache(file_hash, file_size, cached)
                except Exception as e:
                    logger.warning(f"Structure re-analysis failed: {e}")
            logger.info(f"Cache HIT (hash) for {filename}")
            file_path.unlink()
            return cached  # 200 OK

        # ── Tier 2: Fingerprint (same song, different file, ~1-2s) ──
        if not engine:
            try:
                fp_duration, fp_string = compute_fingerprint(str(file_path))
                cached = lookup_cache_by_fingerprint(fp_string, fp_duration)
                if cached is not None:
                    # v2.3: same stale phrase check
                    if not cached.phrase_boundaries and cached.beats and len(cached.beats) >= 8:
                        logger.info(f"Cache HIT (fp) but stale phrases, re-analyzing for {filename}")
                        try:
                            from services.structure_analyzer import analyze_structure_with_phrases
                            sections, phrase_boundaries = analyze_structure_with_phrases(
                                str(file_path), cached.duration, cached.beats, cached.downbeats
                            )
                            cached.sections = sections
                            cached.phrase_boundaries = phrase_boundaries
                        except Exception as e:
                            logger.warning(f"Structure re-analysis failed: {e}")
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
                "client_ip": client_ip,
            }

        thread = threading.Thread(
            target=_run_analysis_background,
            args=(job_id, file_path, file_hash, file_size, filename, engine),
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
