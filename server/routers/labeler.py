"""
Labeler app API routes.
Receives mp3 + pnote submissions from the Ritmo Labeler app.
Stores in local SQLite + filesystem (no Supabase dependency).
"""

import os
import uuid
import hashlib
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/labeler", tags=["labeler"])

# ─── Storage paths ───────────────────────────────────
DATA_DIR = Path(os.getenv("LABELER_DATA_DIR", "/home/jinwoo/musicality/labeler-data"))
MP3_DIR = DATA_DIR / "mp3"
PNOTE_DIR = DATA_DIR / "pnotes"
DB_PATH = DATA_DIR / "labeler.db"

# Ensure directories exist
MP3_DIR.mkdir(parents=True, exist_ok=True)
PNOTE_DIR.mkdir(parents=True, exist_ok=True)


# ─── SQLite setup ────────────────────────────────────
def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS submissions (
            id TEXT PRIMARY KEY,
            author TEXT NOT NULL,
            track_title TEXT NOT NULL,
            mp3_filename TEXT NOT NULL,
            pnote_filename TEXT NOT NULL,
            bpm REAL,
            duration REAL,
            beat_count INTEGER,
            dance_style TEXT,
            file_hash TEXT,
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    # Add columns if they don't exist (migration for existing DBs)
    try:
        conn.execute("SELECT file_hash FROM submissions LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE submissions ADD COLUMN file_hash TEXT")
        conn.commit()
    try:
        conn.execute("SELECT version FROM submissions LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE submissions ADD COLUMN version INTEGER DEFAULT 1")
        conn.commit()
    return conn


# ─── Endpoints ───────────────────────────────────────

@router.post("/submit")
async def submit_labeling(
    author: str = Form(...),
    track_title: str = Form(...),
    mp3_file: UploadFile = File(...),
    pnote_data: str = Form(...),
    file_hash: str = Form(None),
    version: int = Form(1),
):
    """
    Receive labeling submission: mp3 + pnote JSON.
    Stores mp3 file and pnote separately for training data collection.
    """
    submission_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in track_title)[:60]
    safe_author = "".join(c if c.isalnum() or c in "-_" else "_" for c in author)[:20]

    # Save mp3
    mp3_filename = f"{timestamp}_{safe_author}_{safe_title}.mp3"
    mp3_path = MP3_DIR / mp3_filename
    content = await mp3_file.read()
    with open(mp3_path, "wb") as f:
        f.write(content)

    # Compute file hash server-side if not provided
    if not file_hash:
        file_hash = hashlib.sha256(content).hexdigest()

    # Parse and save pnote
    try:
        pnote = json.loads(pnote_data)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid pnote JSON")

    pnote_filename = f"{timestamp}_{safe_author}_{safe_title}_v{version}.pnote.json"
    pnote_path = PNOTE_DIR / pnote_filename
    with open(pnote_path, "w", encoding="utf-8") as f:
        json.dump(pnote, f, ensure_ascii=False, indent=2)

    # Extract metadata from pnote
    music = pnote.get("music", {})
    bpm = music.get("bpm", 0)
    duration = music.get("duration", 0)
    beats = pnote.get("beats", [])
    beat_count = len(beats) if isinstance(beats, list) else 0
    dance_style = music.get("danceStyle", "unknown")

    # Store in SQLite
    db = _get_db()
    db.execute("""
        INSERT INTO submissions (id, author, track_title, mp3_filename, pnote_filename,
                                 bpm, duration, beat_count, dance_style, file_hash, version, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        submission_id, author, track_title, mp3_filename, pnote_filename,
        bpm, duration, beat_count, dance_style, file_hash, version,
        datetime.now(timezone.utc).isoformat(),
    ))
    db.commit()
    db.close()

    file_size_mb = len(content) / 1024 / 1024
    return JSONResponse({
        "status": "ok",
        "id": submission_id,
        "mp3": mp3_filename,
        "pnote": pnote_filename,
        "file_hash": file_hash,
        "version": version,
        "size_mb": round(file_size_mb, 1),
    })


@router.get("/submissions")
async def list_submissions(author: str = None):
    """List all submissions, optionally filtered by author."""
    db = _get_db()
    if author:
        rows = db.execute(
            "SELECT * FROM submissions WHERE author = ? ORDER BY created_at DESC", (author,)
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM submissions ORDER BY created_at DESC"
        ).fetchall()
    db.close()

    return [dict(row) for row in rows]


@router.get("/pnote/{submission_id}")
async def get_pnote(submission_id: str):
    """Return the full pnote JSON for a submission."""
    db = _get_db()
    row = db.execute(
        "SELECT pnote_filename FROM submissions WHERE id = ?", (submission_id,)
    ).fetchone()
    db.close()

    if not row:
        raise HTTPException(404, "Submission not found")

    pnote_path = PNOTE_DIR / row["pnote_filename"]
    if not pnote_path.exists():
        raise HTTPException(404, "Pnote file not found")

    with open(pnote_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.get("/verify/{submission_id}")
async def verify_submission(submission_id: str, pnote_hash: str = Query(...)):
    """Verify that local pnote matches server-stored pnote."""
    db = _get_db()
    row = db.execute(
        "SELECT pnote_filename FROM submissions WHERE id = ?", (submission_id,)
    ).fetchone()
    db.close()

    if not row:
        raise HTTPException(404, "Submission not found")

    pnote_path = PNOTE_DIR / row["pnote_filename"]
    if not pnote_path.exists():
        raise HTTPException(404, "Pnote file not found")

    # Hash the server-side pnote content
    with open(pnote_path, "rb") as f:
        server_hash = hashlib.sha256(f.read()).hexdigest()

    return {
        "submission_id": submission_id,
        "match": server_hash == pnote_hash,
        "server_hash": server_hash,
    }


@router.get("/history/{file_hash}")
async def track_history(file_hash: str):
    """Get all submissions for a given file hash (version history)."""
    db = _get_db()
    rows = db.execute(
        "SELECT * FROM submissions WHERE file_hash = ? ORDER BY version ASC, created_at ASC",
        (file_hash,)
    ).fetchall()
    db.close()

    return [dict(row) for row in rows]


@router.get("/stats")
async def labeler_stats():
    """Quick stats for the labeler dashboard."""
    db = _get_db()
    total = db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0]
    authors = db.execute("SELECT DISTINCT author FROM submissions").fetchall()
    by_author = db.execute(
        "SELECT author, COUNT(*) as count FROM submissions GROUP BY author ORDER BY count DESC"
    ).fetchall()
    db.close()

    return {
        "total_submissions": total,
        "unique_authors": len(authors),
        "by_author": [dict(r) for r in by_author],
    }
