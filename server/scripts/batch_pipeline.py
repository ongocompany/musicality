"""
Bachata/Salsa Batch Analysis Pipeline
======================================
사전 분석 파이프라인: Spotify → YouTube → Madmom 분석 → AcoustID 매핑 → SQLite 저장

Usage:
    # 1단계: Spotify에서 곡 목록 수집
    python3 batch_pipeline.py --collect

    # 2단계: YouTube에서 오디오 다운로드 + 필터
    python3 batch_pipeline.py --download

    # 3단계: Madmom 분석 + AcoustID 매핑 + DB 저장
    python3 batch_pipeline.py --analyze

    # 전체 파이프라인
    python3 batch_pipeline.py --all

    # 상태 확인
    python3 batch_pipeline.py --status

Requires:
    pip install spotipy yt-dlp pyacoustid mutagen requests
"""

import os
import re
import json
import logging
import argparse
import time
import subprocess
import sqlite3
import uuid
import collections
import collections.abc
from pathlib import Path

# Numpy/collections compatibility shims (same as main.py)
for _attr in ('MutableSequence', 'MutableMapping', 'MutableSet', 'Mapping', 'Sequence'):
    if not hasattr(collections, _attr):
        setattr(collections, _attr, getattr(collections.abc, _attr))

import numpy as np
np.int = int     # type: ignore[attr-defined]
np.float = float # type: ignore[attr-defined]
np.complex = complex # type: ignore[attr-defined]
np.bool = bool   # type: ignore[attr-defined]

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────

BASE_DIR = "/mnt/nvme/batch_analyze"
QUEUE_FILE = f"{BASE_DIR}/playlist_queue.json"
PENDING_DIR = f"{BASE_DIR}/pending"    # download writes here (unsafe for reading)
READY_DIR = f"{BASE_DIR}/ready"        # download-complete files staged here (safe for analysis)
DONE_DIR = f"{BASE_DIR}/done"          # analysis-complete files
REJECTED_DIR = f"{BASE_DIR}/rejected"
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "analysis_cache.db")


# AcoustID
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY", "5urpeh7f0F")

# Filters
DURATION_MIN = 90    # 1.5분
DURATION_MAX = 480   # 8분
MIN_AUDIO_QUALITY = 128
BPM_BACHATA = (120, 150)
BPM_SALSA = (150, 210)
BPM_ALLOWED = (115, 215)  # 넓은 범위 (바차타+살사 모두 포함)
MIN_CONFIDENCE = 0.3
MIN_BEATS = 50

TITLE_BLACKLIST = [
    "tutorial", "lesson", "class", "reaction", "react",
    "cover dance", "dance cover", "footwork", "workshop",
    "megamix", "medley", "mix 2024", "mix 2025", "nonstop",
    "choreography tutorial", "how to dance",
    "karaoke", "instrumental only", "drum cover",
]

# YouTube channels and playlists (direct source, no Spotify needed)
# Format: (url, name, genre)
SEED_YOUTUBE = [
    # Bachata artist channels — uploads playlists
    ("https://www.youtube.com/@DaniJOfficial/videos", "Dani J", "bachata"),
    ("https://www.youtube.com/@MrDonOficial/videos", "Mr. Don", "bachata"),
    ("https://www.youtube.com/@VinnyRiveraOfficial/videos", "Vinny Rivera", "bachata"),
    ("https://www.youtube.com/@DerekVinciOfficial/videos", "DerekVinci", "bachata"),
    ("https://www.youtube.com/@EsmeOficial/videos", "Esme", "bachata"),
    ("https://www.youtube.com/@GrupoExtraTV/videos", "Grupo Extra", "bachata"),
    ("https://www.youtube.com/@KarlosRoseOfficial/videos", "Karlos Rosé", "bachata"),
    ("https://www.youtube.com/@DanielSantacruzMusic/videos", "Daniel Santacruz", "bachata"),
    ("https://www.youtube.com/@RomeoSantosVEVO/videos", "Romeo Santos", "bachata"),
    ("https://www.youtube.com/@PrinceRoyceVEVO/videos", "Prince Royce", "bachata"),
    ("https://www.youtube.com/@AventuraVEVO/videos", "Aventura", "bachata"),
    ("https://www.youtube.com/@FrankReyesVEVO/videos", "Frank Reyes", "bachata"),
    ("https://www.youtube.com/@ZacariasFerreiraVEVO/videos", "Zacarías Ferreira", "bachata"),
    # Bachata compilation channels
    ("https://www.youtube.com/@DjKhalidBachata/videos", "DJ Khalid", "bachata"),
    ("https://www.youtube.com/@BachataHeightz/videos", "Bachata Heightz", "bachata"),
    # Salsa artist channels
    ("https://www.youtube.com/@MarcAnthonyVEVO/videos", "Marc Anthony", "salsa"),
    ("https://www.youtube.com/@GilbertoSantaRosaVEVO/videos", "Gilberto Santa Rosa", "salsa"),
    # YouTube playlists (curated bachata/salsa collections)
    ("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs0IfM1of2vQoTR", "Bachata Hits", "bachata"),
    ("https://www.youtube.com/playlist?list=PLGBuKfnErZlCxr6CEzUXtGbLNMCJdE2RP", "Bachata 2024", "bachata"),
]

# Search queries for broader collection
SEED_SEARCHES = [
    # Bachata
    "bachata 2024 official video",
    "bachata 2025 official video",
    "bachata sensual music",
    "bachata romantica 2024",
    "new bachata songs",
    "bachata dominicana 2024",
    # Salsa
    "salsa romantica",
    "salsa clasica",
    "salsa 2024 official",
]

# Known bachata/salsa artists for YouTube search (base list)
_BASE_ARTISTS = [
    # Bachata
    "Romeo Santos", "Prince Royce", "Aventura", "Dani J",
    "Mr. Don", "Vinny Rivera", "DerekVinci", "Esme",
    "Daniel Santacruz", "Grupo Extra", "Kewin Cosmos",
    "Karlos Rosé", "DJ Khalid", "Dustin Richie",
    "Frank Reyes", "Anthony Santos", "Raulin Rodriguez",
    "Yoskar Sarante", "Zacarías Ferreira", "Juan Luis Guerra",
    "Monchy & Alexandra", "Hector Acosta", "Luis Vargas",
    "Joe Veras", "Elvis Martinez", "Bray On", "Joel Santos",
    "J Salez", "Chavi Leons", "Sebastian Garreta", "Dave Aguilar",
    "Jensen", "Mario Baro", "Roman El Original", "Liza y Willie",
    # Salsa
    "Marc Anthony", "Gilberto Santa Rosa", "Oscar D'León",
    "Héctor Lavoe", "Rubén Blades", "Celia Cruz",
    "Willie Colón", "Frankie Ruiz", "Jerry Rivera",
    "Victor Manuelle", "Tito Rojas", "La India",
    "Sonora Ponceña", "El Gran Combo",
]

# External artist list from existing library (auto-generated)
EXTERNAL_ARTISTS_FILE = "/mnt/nvme/existing_artists.json"

def _load_seed_artists(max_artists=200):
    """Load artists from base list + external file, deduplicated."""
    artists = list(_BASE_ARTISTS)
    seen = {a.lower() for a in artists}

    # Load external artist list if exists
    if os.path.exists(EXTERNAL_ARTISTS_FILE):
        try:
            with open(EXTERNAL_ARTISTS_FILE, "r", encoding="utf-8") as f:
                external = json.load(f)
            for a in external:
                if a.lower() not in seen and len(a) > 2:
                    artists.append(a)
                    seen.add(a.lower())
        except Exception as e:
            logger.warning(f"Could not load external artists: {e}")

    # Filter out generic/DJ names that produce noisy results
    skip_prefixes = ["dj ", "dj_", "@", "http"]
    filtered = []
    for a in artists:
        if any(a.lower().startswith(p) for p in skip_prefixes):
            continue
        filtered.append(a)

    return filtered[:max_artists]

SEED_ARTISTS = _load_seed_artists()


# ── Helpers ──────────────────────────────────────────────────────

def _ensure_dirs():
    for d in [BASE_DIR, PENDING_DIR, READY_DIR, DONE_DIR, REJECTED_DIR]:
        os.makedirs(d, exist_ok=True)


def _is_blacklisted(title: str) -> bool:
    """Check if title matches blacklist."""
    title_lower = title.lower()
    for bl in TITLE_BLACKLIST:
        if bl in title_lower:
            return True
    return False


def _sanitize_filename(text: str) -> str:
    """Clean text for filesystem use."""
    text = re.sub(r'[<>:"/\\|?*]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text[:150]  # Limit length


# ── Step 1: YouTube Collection ───────────────────────────────────

YTDLP = os.path.join(os.path.dirname(os.path.dirname(__file__)), "venv", "bin", "yt-dlp")

def _yt_extract_info(url_or_query: str, max_items: int = 50) -> list:
    """Extract video info from YouTube URL or search query via yt-dlp."""
    cmd = [
        YTDLP,
        url_or_query,
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s\t%(duration)s\t%(channel)s",
        "--no-download",
        "--no-warnings",
        f"--playlist-end={max_items}",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        entries = []
        for line in result.stdout.strip().split("\n"):
            if not line or "\t" not in line:
                continue
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            vid_id = parts[0]
            title = parts[1]
            try:
                duration = float(parts[2]) if parts[2] != "NA" else 0
            except (ValueError, TypeError):
                duration = 0
            channel = parts[3] if len(parts) > 3 else ""
            entries.append({
                "video_id": vid_id,
                "title": title,
                "duration": duration,
                "channel": channel,
            })
        return entries
    except Exception as e:
        logger.debug(f"yt-dlp extract failed: {e}")
        return []


def _parse_yt_title(title: str) -> tuple:
    """Try to parse artist and song title from YouTube video title."""
    # Remove common suffixes
    cleaned = re.sub(r'\s*[\(\[](official\s*(video|audio|lyric|music)|video\s*oficial|lyric\s*video|audio\s*oficial|visualizer|bachata\s*\d{4}|salsa)[\)\]]', '', title, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s*\|.*$', '', cleaned)  # Remove " | anything"
    cleaned = re.sub(r'\s*ft\.?\s*', ' feat. ', cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip()

    # Try "Artist - Title" pattern
    match = re.match(r'^(.+?)\s*[-–—]\s+(.+)$', cleaned)
    if match:
        return match.group(1).strip(), match.group(2).strip()

    # Try "Title · Artist" pattern
    if '·' in cleaned:
        parts = [p.strip() for p in cleaned.split('·', 1)]
        return parts[1] if len(parts) > 1 else "", parts[0]

    return "", cleaned


def collect_from_youtube():
    """Collect track list from YouTube channels, playlists, and searches."""
    _ensure_dirs()

    tracks = {}  # video_id → track info (dedup)

    # 1. Channels and playlists
    logger.info(f"Collecting from {len(SEED_YOUTUBE)} YouTube sources...")
    for url, name, genre in SEED_YOUTUBE:
        try:
            entries = _yt_extract_info(url, max_items=200)
            added = 0
            for e in entries:
                if e["video_id"] in tracks:
                    continue
                if e["duration"] < DURATION_MIN or e["duration"] > DURATION_MAX:
                    continue
                if _is_blacklisted(e["title"]):
                    continue

                artist, title = _parse_yt_title(e["title"])
                if not artist:
                    artist = name  # Use channel name as artist

                tracks[e["video_id"]] = {
                    "video_id": e["video_id"],
                    "title": title,
                    "artist": artist,
                    "yt_title": e["title"],
                    "duration_s": round(e["duration"], 1),
                    "genre": genre,
                    "source": name,
                    "status": "pending",
                }
                added += 1

            logger.info(f"  [{name}] +{added} tracks (total unique: {len(tracks)})")
            time.sleep(1)
        except Exception as e:
            logger.warning(f"  [{name}] Failed: {e}")

    # 2. Artist search on YouTube (top results per artist)
    logger.info(f"\nSearching {len(SEED_ARTISTS)} artists on YouTube...")
    for artist_name in SEED_ARTISTS:
        try:
            query = f"{artist_name} bachata official"
            entries = _yt_extract_info(f"ytsearch20:{query}", max_items=20)
            added = 0
            for e in entries:
                if e["video_id"] in tracks:
                    continue
                if e["duration"] < DURATION_MIN or e["duration"] > DURATION_MAX:
                    continue
                if _is_blacklisted(e["title"]):
                    continue

                artist, title = _parse_yt_title(e["title"])
                if not artist:
                    artist = artist_name

                tracks[e["video_id"]] = {
                    "video_id": e["video_id"],
                    "title": title,
                    "artist": artist,
                    "yt_title": e["title"],
                    "duration_s": round(e["duration"], 1),
                    "genre": "latin",
                    "source": f"search:{artist_name}",
                    "status": "pending",
                }
                added += 1

            logger.info(f"  [{artist_name}] +{added} (total: {len(tracks)})")
            time.sleep(1)
        except Exception as e:
            logger.warning(f"  [{artist_name}] Failed: {e}")

    # 3. General searches
    logger.info(f"\nRunning {len(SEED_SEARCHES)} general searches...")
    for query in SEED_SEARCHES:
        try:
            entries = _yt_extract_info(f"ytsearch30:{query}", max_items=30)
            added = 0
            for e in entries:
                if e["video_id"] in tracks:
                    continue
                if e["duration"] < DURATION_MIN or e["duration"] > DURATION_MAX:
                    continue
                if _is_blacklisted(e["title"]):
                    continue

                artist, title = _parse_yt_title(e["title"])

                tracks[e["video_id"]] = {
                    "video_id": e["video_id"],
                    "title": title,
                    "artist": artist,
                    "yt_title": e["title"],
                    "duration_s": round(e["duration"], 1),
                    "genre": "latin",
                    "source": f"search:{query}",
                    "status": "pending",
                }
                added += 1

            logger.info(f"  [{query}] +{added} (total: {len(tracks)})")
            time.sleep(1)
        except Exception as e:
            logger.warning(f"  [{query}] Failed: {e}")

    # Save queue
    queue = {
        "collected_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "total": len(tracks),
        "tracks": list(tracks.values()),
    }
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)

    logger.info(f"\n{'='*50}")
    logger.info(f"Collection complete: {len(tracks)} unique tracks")
    logger.info(f"Saved to {QUEUE_FILE}")
    logger.info(f"{'='*50}")
    return queue


# ── Step 2: YouTube Download ────────────────────────────────────

def download_from_youtube(max_downloads: int = 0):
    """Download audio from YouTube for each track in queue."""
    _ensure_dirs()

    if not os.path.exists(QUEUE_FILE):
        logger.error("No queue file. Run --collect first.")
        return

    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        queue = json.load(f)

    tracks = queue["tracks"]
    pending = [t for t in tracks if t["status"] == "pending"]
    logger.info(f"Download queue: {len(pending)} pending / {len(tracks)} total")

    if max_downloads > 0:
        pending = pending[:max_downloads]
        logger.info(f"  Limiting to {max_downloads} downloads")

    downloaded = 0
    skipped = 0
    failed = 0

    for i, track in enumerate(pending):
        search_query = f"{track['artist']} - {track['title']}"

        # Skip blacklisted titles
        if _is_blacklisted(search_query):
            track["status"] = "blacklisted"
            skipped += 1
            continue

        # Use video_id as filename to avoid special char issues, rename later
        vid = track.get("video_id", _sanitize_filename(search_query))
        output_template = os.path.join(PENDING_DIR, f"{vid}.%(ext)s")
        output_mp3 = os.path.join(PENDING_DIR, f"{vid}.mp3")

        # Skip if already downloaded (check pending, ready, and done)
        ready_mp3 = os.path.join(READY_DIR, f"{vid}.mp3")
        done_mp3 = os.path.join(DONE_DIR, f"{vid}.mp3")
        if os.path.exists(output_mp3) or os.path.exists(ready_mp3) or os.path.exists(done_mp3):
            track["status"] = "downloaded"
            skipped += 1
            continue

        try:
            # Use video_id if available (from collect), else search
            video_url = f"https://www.youtube.com/watch?v={track['video_id']}" if track.get("video_id") else f"ytsearch1:{search_query}"

            cmd = [
                YTDLP,
                video_url,
                "--extract-audio",
                "--audio-format", "mp3",
                "--audio-quality", "5",  # ~128kbps
                "--max-downloads", "1",
                "--match-filter", f"duration >= {DURATION_MIN} & duration <= {DURATION_MAX}",
                "--no-playlist",
                "--no-warnings",
                "-o", output_template,
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)

            # Debug: log failures
            if result.returncode != 0:
                logger.debug(f"  yt-dlp rc={result.returncode} stderr={result.stderr[:200]}")

            if os.path.exists(output_mp3):
                file_size = os.path.getsize(output_mp3)
                if file_size < 500_000:  # < 500KB = probably not a real song
                    os.remove(output_mp3)
                    track["status"] = "too_small"
                    failed += 1
                else:
                    # Move to ready/ dir — only fully-written files go here
                    ready_path = os.path.join(READY_DIR, f"{vid}.mp3")
                    os.rename(output_mp3, ready_path)
                    track["status"] = "downloaded"
                    track["file_path"] = ready_path
                    downloaded += 1
                    logger.info(f"  [{i+1}/{len(pending)}] ✓ {search_query[:60]}")
            else:
                track["status"] = "download_failed"
                failed += 1
                if (i + 1) % 20 == 0:
                    logger.info(f"  [{i+1}/{len(pending)}] progress: dl={downloaded} skip={skipped} fail={failed}")

        except subprocess.TimeoutExpired:
            track["status"] = "timeout"
            failed += 1
        except Exception as e:
            track["status"] = "error"
            failed += 1
            logger.debug(f"  Download error: {e}")

        time.sleep(1)  # Be nice to YouTube

    # Save updated queue
    with open(QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue, f, ensure_ascii=False, indent=2)

    logger.info(f"\nDownload complete: {downloaded} downloaded, {skipped} skipped, {failed} failed")
    return downloaded


# ── Step 3: Analyze + Store ─────────────────────────────────────

def _get_db() -> sqlite3.Connection:
    """Get SQLite connection with schema ready."""
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    # Ensure recording_id column exists
    try:
        conn.execute("SELECT recording_id FROM analysis_cache LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE analysis_cache ADD COLUMN recording_id TEXT DEFAULT ''")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_recording ON analysis_cache(recording_id) WHERE recording_id != ''")
        conn.commit()
        logger.info("Added recording_id column to analysis_cache")

    # Ensure analyzer_engine column exists
    try:
        conn.execute("SELECT analyzer_engine FROM analysis_cache LIMIT 1")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE analysis_cache ADD COLUMN analyzer_engine TEXT DEFAULT ''")
        conn.commit()
        logger.info("Added analyzer_engine column to analysis_cache")

    return conn


def _acoustid_lookup(fingerprint: str, duration: float) -> str:
    """Get AcoustID recording ID from fingerprint."""
    try:
        payload = {
            "client": ACOUSTID_API_KEY,
            "fingerprint": fingerprint,
            "duration": int(duration),
            "meta": "recordings+compress",
        }
        resp = requests.post("https://api.acoustid.org/v2/lookup", data=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != "ok":
            return ""

        results = data.get("results", [])
        if not results:
            return ""

        best = max(results, key=lambda r: r.get("score", 0))
        if best.get("score", 0) < 0.4:
            return ""

        recordings = best.get("recordings", [])
        if recordings:
            return recordings[0].get("id", "")

        return ""
    except Exception:
        return ""


def analyze_pending():
    """Analyze downloaded files with Madmom and store results."""
    # Import here to avoid loading madmom at startup
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from services.beat_analyzer import analyze_audio
    from services.analysis_cache import compute_file_hash, compute_fingerprint

    _ensure_dirs()
    db = _get_db()

    files = sorted(Path(READY_DIR).glob("*.mp3"))
    logger.info(f"Analyzing {len(files)} files in {READY_DIR}")

    analyzed = 0
    rejected = 0
    cached = 0

    for i, filepath in enumerate(files):
        filename = filepath.name

        try:
            file_hash = compute_file_hash(str(filepath))

            # Check if already in cache
            existing = db.execute(
                "SELECT id FROM analysis_cache WHERE file_hash = ? LIMIT 1",
                (file_hash,)
            ).fetchone()
            if existing:
                filepath.rename(Path(DONE_DIR) / filename)
                cached += 1
                continue

            # Fingerprint + AcoustID recording ID
            try:
                fp_duration, fp_string = compute_fingerprint(str(filepath))
                recording_id = _acoustid_lookup(fp_string, fp_duration)
            except Exception:
                fp_string = ""
                fp_duration = 0
                recording_id = ""

            # Check if recording_id already cached
            if recording_id:
                existing = db.execute(
                    "SELECT id FROM analysis_cache WHERE recording_id = ? LIMIT 1",
                    (recording_id,)
                ).fetchone()
                if existing:
                    filepath.rename(Path(DONE_DIR) / filename)
                    cached += 1
                    logger.info(f"  [{i+1}/{len(files)}] ⏭ Already cached (recording_id): {filename[:50]}")
                    continue

            # Run Madmom analysis
            result = analyze_audio(str(filepath))

            # Validate BPM
            if result.bpm < BPM_ALLOWED[0] or result.bpm > BPM_ALLOWED[1]:
                filepath.rename(Path(REJECTED_DIR) / filename)
                rejected += 1
                logger.info(f"  [{i+1}/{len(files)}] ✗ BPM {result.bpm:.0f} out of range: {filename[:50]}")
                continue

            # Validate beats
            if len(result.beats) < MIN_BEATS:
                filepath.rename(Path(REJECTED_DIR) / filename)
                rejected += 1
                continue

            # Store in cache
            sections_json = json.dumps([
                {"label": s.label, "start_time": s.start_time, "end_time": s.end_time, "confidence": s.confidence}
                for s in result.sections
            ])
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            file_size = filepath.stat().st_size

            db.execute(
                """INSERT OR IGNORE INTO analysis_cache
                   (id, file_hash, file_size, bpm, beats, downbeats, duration,
                    beats_per_bar, confidence, sections, phrase_boundaries,
                    waveform_peaks, fingerprint, analyzer_version, analyzer_engine,
                    hit_count, metadata, recording_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)""",
                (
                    str(uuid.uuid4()), file_hash, file_size,
                    result.bpm, json.dumps(result.beats), json.dumps(result.downbeats),
                    result.duration, result.beats_per_bar, result.confidence,
                    sections_json, json.dumps(result.phrase_boundaries),
                    json.dumps(result.waveform_peaks), fp_string,
                    "v2.2", result.analyzer_engine,
                    None, recording_id, now, now,
                ),
            )
            db.commit()

            # Move to done
            filepath.rename(Path(DONE_DIR) / filename)
            analyzed += 1
            logger.info(f"  [{i+1}/{len(files)}] ✓ BPM={result.bpm:.0f} rec={recording_id[:8] if recording_id else 'N/A'}: {filename[:50]}")

        except Exception as e:
            logger.warning(f"  [{i+1}/{len(files)}] ✗ Error: {e} — {filename[:50]}")
            try:
                filepath.rename(Path(REJECTED_DIR) / filename)
            except Exception:
                pass
            rejected += 1

    logger.info(f"\nAnalysis complete: {analyzed} analyzed, {cached} already cached, {rejected} rejected")
    logger.info(f"Done files kept in {DONE_DIR} (run --cleanup to remove after verification)")

    return analyzed


# ── Status ───────────────────────────────────────────────────────

def show_status():
    """Show pipeline status."""
    logger.info("=" * 50)
    logger.info("  Batch Pipeline Status")
    logger.info("=" * 50)

    # Queue
    if os.path.exists(QUEUE_FILE):
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            queue = json.load(f)
        tracks = queue["tracks"]
        statuses = {}
        for t in tracks:
            s = t.get("status", "unknown")
            statuses[s] = statuses.get(s, 0) + 1
        logger.info(f"\nQueue: {len(tracks)} total")
        for s, c in sorted(statuses.items()):
            logger.info(f"  {s}: {c}")
    else:
        logger.info("\nQueue: not created yet (run --collect)")

    # File counts
    downloading = list(Path(PENDING_DIR).glob("*.mp3")) if os.path.exists(PENDING_DIR) else []
    ready = list(Path(READY_DIR).glob("*.mp3")) if os.path.exists(READY_DIR) else []
    done = list(Path(DONE_DIR).glob("*.mp3")) if os.path.exists(DONE_DIR) else []
    rejected = list(Path(REJECTED_DIR).glob("*.mp3")) if os.path.exists(REJECTED_DIR) else []
    logger.info(f"\nFiles: {len(downloading)} downloading, {len(ready)} ready, {len(done)} done, {len(rejected)} rejected")

    # Cache DB
    if os.path.exists(DB_PATH):
        db = sqlite3.connect(DB_PATH)
        total = db.execute("SELECT COUNT(*) FROM analysis_cache").fetchone()[0]
        with_rec = db.execute("SELECT COUNT(*) FROM analysis_cache WHERE recording_id != ''").fetchone()[0]
        db.close()
        logger.info(f"\nCache DB: {total} entries ({with_rec} with recording_id)")
    else:
        logger.info(f"\nCache DB: not found at {DB_PATH}")

    logger.info("=" * 50)


# ── Main ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Bachata/Salsa Batch Analysis Pipeline")
    parser.add_argument("--collect", action="store_true", help="Step 1: Collect tracks from Spotify")
    parser.add_argument("--download", action="store_true", help="Step 2: Download audio from YouTube")
    parser.add_argument("--download-limit", type=int, default=0, help="Max downloads (0=unlimited)")
    parser.add_argument("--analyze", action="store_true", help="Step 3: Analyze + store in cache")
    parser.add_argument("--all", action="store_true", help="Run full pipeline")
    parser.add_argument("--status", action="store_true", help="Show pipeline status")
    args = parser.parse_args()

    if args.status:
        show_status()
    elif args.collect:
        collect_from_youtube()
    elif args.download:
        download_from_youtube(max_downloads=args.download_limit)
    elif args.analyze:
        analyze_pending()
    elif args.all:
        logger.info("=" * 50)
        logger.info("  FULL PIPELINE")
        logger.info("=" * 50)

        logger.info("\n[1/3] Collecting from YouTube...")
        collect_from_youtube()

        logger.info("\n[2/3] Downloading from YouTube...")
        download_from_youtube()

        logger.info("\n[3/3] Analyzing...")
        analyze_pending()

        show_status()
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
