"""
Labeling tool API routes.
Upload audio → analyze → store in Supabase → label editing → save.
"""

import os
import uuid
import hashlib
import shutil
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse

from services.beat_analyzer import analyze_audio
from services.supabase_client import get_supabase

router = APIRouter()

# Simple tester accounts (no heavy auth needed)
TESTERS = {
    "jinwoo": "ritmo2026",
    "tester1": "bachata1",
    "tester2": "bachata2",
    "tester3": "bachata3",
    "tester4": "bachata4",
    "tester5": "bachata5",
}

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB
STORAGE_BUCKET = "labeling-audio"


def _file_hash(file_path: str) -> str:
    """Compute SHA256 hash of a file."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


@router.post("/login")
async def login(body: dict):
    """Simple login for labeling tool."""
    username = body.get("username", "").strip()
    password = body.get("password", "").strip()
    if username in TESTERS and TESTERS[username] == password:
        return {"status": "ok", "labeler_id": username}
    raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/upload")
async def upload_and_analyze(
    file: UploadFile = File(...),
    title: str = Form(default=""),
):
    """
    Upload an audio file, analyze it, and store results in Supabase.

    1. Save temp file → compute SHA256 hash
    2. Check for duplicate (by hash)
    3. Run beat + structure analysis
    4. Upload audio to Supabase Storage
    5. Insert track + auto_sections into DB
    6. Return track info + analysis results
    """
    filename = file.filename or "unknown.mp3"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported format '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Save to temp file
    secure_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / secure_name

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = file_path.stat().st_size
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large")
        if file_size == 0:
            raise HTTPException(status_code=400, detail="Empty file")

        # Compute hash for dedup
        fhash = _file_hash(str(file_path))

        # Check duplicate
        sb = get_supabase()
        existing = sb.table("tracks").select("id").eq("file_hash", fhash).execute()
        if existing.data:
            track_id = existing.data[0]["id"]
            # Load existing data
            track_data = sb.table("tracks").select("*").eq("id", track_id).execute()
            auto = sb.table("auto_sections").select("*").eq("track_id", track_id).order("start_time").execute()
            user = sb.table("user_labels").select("*").eq("track_id", track_id).order("start_time").execute()

            track = track_data.data[0]
            audio_url = sb.storage.from_(STORAGE_BUCKET).get_public_url(f"{fhash}{ext}")

            return {
                "track_id": track_id,
                "title": track["title"],
                "filename": track["filename"],
                "duration": track["duration"],
                "bpm": track["bpm"],
                "beats": track.get("beats") or [],
                "downbeats": track.get("downbeats") or [],
                "audio_url": audio_url,
                "auto_sections": auto.data,
                "user_labels": user.data,
                "is_duplicate": True,
            }

        # Run analysis
        result = analyze_audio(str(file_path))

        # Upload to Supabase Storage
        storage_path = f"{fhash}{ext}"
        with open(file_path, "rb") as f:
            sb.storage.from_(STORAGE_BUCKET).upload(
                storage_path,
                f.read(),
                file_options={"content-type": f"audio/{ext.lstrip('.')}"},
            )
        audio_url = sb.storage.from_(STORAGE_BUCKET).get_public_url(storage_path)

        # Use filename as title if not provided
        track_title = title.strip() if title.strip() else os.path.splitext(filename)[0]

        # Insert track
        track_row = sb.table("tracks").insert({
            "title": track_title,
            "filename": filename,
            "duration": result.duration,
            "bpm": result.bpm,
            "beats": result.beats,
            "downbeats": result.downbeats,
            "audio_path": storage_path,
            "file_hash": fhash,
        }).execute()

        track_id = track_row.data[0]["id"]

        # Insert auto_sections
        if result.sections:
            sections_data = [
                {
                    "track_id": track_id,
                    "label": s.label,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "confidence": s.confidence,
                    "analyzer_version": "v2.1",
                }
                for s in result.sections
            ]
            sb.table("auto_sections").insert(sections_data).execute()

        return {
            "track_id": track_id,
            "title": track_title,
            "filename": filename,
            "duration": result.duration,
            "bpm": result.bpm,
            "beats": result.beats,
            "downbeats": result.downbeats,
            "audio_url": audio_url,
            "auto_sections": [
                {
                    "label": s.label,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "confidence": s.confidence,
                }
                for s in result.sections
            ],
            "user_labels": [],
            "is_duplicate": False,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload/analysis failed: {str(e)}")
    finally:
        if file_path.exists():
            file_path.unlink()


@router.get("/tracks")
async def list_tracks():
    """List all tracks with label status."""
    sb = get_supabase()

    tracks = sb.table("tracks").select("*").order("created_at", desc=True).execute()

    result = []
    for t in tracks.data:
        # Check if user labels exist
        labels = sb.table("user_labels").select("id").eq("track_id", t["id"]).limit(1).execute()
        result.append({
            **t,
            "has_labels": len(labels.data) > 0,
        })

    return result


@router.get("/tracks/{track_id}")
async def get_track(track_id: str):
    """Get track info with auto_sections and user_labels."""
    sb = get_supabase()

    track = sb.table("tracks").select("*").eq("id", track_id).execute()
    if not track.data:
        raise HTTPException(status_code=404, detail="Track not found")

    track_data = track.data[0]
    ext = os.path.splitext(track_data["filename"])[1].lower() or ".mp3"
    audio_url = sb.storage.from_(STORAGE_BUCKET).get_public_url(
        f"{track_data['file_hash']}{ext}"
    )

    auto = sb.table("auto_sections").select("*").eq("track_id", track_id).order("start_time").execute()
    user = sb.table("user_labels").select("*").eq("track_id", track_id).order("start_time").execute()

    return {
        **track_data,
        "audio_url": audio_url,
        "auto_sections": auto.data,
        "user_labels": user.data,
        "beats": track_data.get("beats") or [],
        "downbeats": track_data.get("downbeats") or [],
    }


@router.post("/tracks/{track_id}/labels")
async def save_labels(track_id: str, body: dict):
    """
    Save user labels for a track.
    Replaces existing labels (DELETE + INSERT).

    Body: {
        "sections": [{ "label": "intro", "start_time": 0, "end_time": 21.5 }, ...],
        "labeler_id": "expert_1",
        "source": "web_tool"
    }
    """
    sb = get_supabase()

    # Verify track exists
    track = sb.table("tracks").select("id").eq("id", track_id).execute()
    if not track.data:
        raise HTTPException(status_code=404, detail="Track not found")

    sections = body.get("sections", [])
    labeler_id = body.get("labeler_id", "anonymous")
    source = body.get("source", "web_tool")

    if not sections:
        raise HTTPException(status_code=400, detail="No sections provided")

    now = datetime.now(timezone.utc).isoformat()

    # Delete existing labels for this track + labeler
    sb.table("user_labels").delete().eq("track_id", track_id).eq("labeler_id", labeler_id).execute()

    # Insert new labels
    labels_data = [
        {
            "track_id": track_id,
            "label": s["label"],
            "start_time": s["start_time"],
            "end_time": s["end_time"],
            "labeler_id": labeler_id,
            "source": source,
            "created_at": now,
            "updated_at": now,
        }
        for s in sections
    ]
    sb.table("user_labels").insert(labels_data).execute()

    return {"status": "saved", "count": len(labels_data)}


@router.post("/downloads/upload")
async def upload_download(file: UploadFile = File(...)):
    """Upload an audio file to the downloads directory."""
    dl_dir = Path(__file__).parent.parent / "labeling" / "downloads"
    dl_dir.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "unknown.mp3"
    dest = dl_dir / filename
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "ok", "name": filename}


@router.get("/downloads/list")
async def list_downloads():
    """List all audio files available for download."""
    dl_dir = Path(__file__).parent.parent / "labeling" / "downloads"
    if not dl_dir.exists():
        return []
    audio_exts = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".mp4", ".mov", ".avi", ".mkv"}
    files = []
    for f in sorted(dl_dir.iterdir()):
        if f.suffix.lower() in audio_exts:
            files.append({"name": f.name, "url": f"/downloads/{f.name}"})
    return files


@router.get("/stats")
async def get_stats():
    """Get labeling statistics and auto vs user accuracy."""
    sb = get_supabase()

    tracks = sb.table("tracks").select("id").execute()
    total_tracks = len(tracks.data)

    # Tracks with user labels
    labeled_tracks = set()
    all_labels = sb.table("user_labels").select("track_id").execute()
    for l in all_labels.data:
        labeled_tracks.add(l["track_id"])

    # Label distribution (user labels)
    label_dist = {}
    all_user = sb.table("user_labels").select("label").execute()
    for l in all_user.data:
        label_dist[l["label"]] = label_dist.get(l["label"], 0) + 1

    # Auto label distribution
    auto_dist = {}
    all_auto = sb.table("auto_sections").select("label").execute()
    for s in all_auto.data:
        auto_dist[s["label"]] = auto_dist.get(s["label"], 0) + 1

    return {
        "total_tracks": total_tracks,
        "labeled_tracks": len(labeled_tracks),
        "unlabeled_tracks": total_tracks - len(labeled_tracks),
        "user_label_distribution": label_dist,
        "auto_label_distribution": auto_dist,
    }
