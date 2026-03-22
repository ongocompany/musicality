#!/usr/bin/env python3
"""
Batch analysis script — pre-analyze music files to fill LOCAL SQLite cache.
Results are stored locally, NOT uploaded to Supabase.
Merge to Supabase separately after deduplication.

Usage:
    cd server
    python scripts/batch_analyze.py /path/to/music-folder/
    python scripts/batch_analyze.py /path/to/music-folder/ --dry-run
    python scripts/batch_analyze.py /path/to/music-folder/ --db-path ./my_cache.db

Supported formats: mp3, wav, flac, m4a, aac, ogg
"""

import argparse
import collections
import collections.abc
import hashlib
import json
import logging
import os
import sqlite3
import sys
import time
import uuid
from pathlib import Path

# Compatibility shims for madmom
for _attr in ('MutableSequence', 'MutableMapping', 'MutableSet', 'Mapping', 'Sequence'):
    if not hasattr(collections, _attr):
        setattr(collections, _attr, getattr(collections.abc, _attr))

import numpy as np
np.int = int
np.float = float
np.complex = complex
np.bool = bool

# Add parent dir to path so we can import server modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.beat_analyzer import analyze_audio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}
HASH_CHUNK_SIZE = 8192


def compute_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(HASH_CHUNK_SIZE)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def _get_db(db_path: str) -> sqlite3.Connection:
    """Get SQLite connection with schema ready."""
    conn = sqlite3.connect(db_path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")

    conn.execute("""CREATE TABLE IF NOT EXISTS analysis_cache (
        id TEXT PRIMARY KEY,
        file_hash TEXT NOT NULL,
        file_size INTEGER,
        bpm REAL,
        beats TEXT,
        downbeats TEXT,
        duration REAL,
        beats_per_bar INTEGER,
        confidence REAL,
        sections TEXT,
        phrase_boundaries TEXT,
        waveform_peaks TEXT,
        fingerprint TEXT DEFAULT '',
        analyzer_version TEXT DEFAULT 'v2.2',
        analyzer_engine TEXT DEFAULT '',
        hit_count INTEGER DEFAULT 0,
        metadata TEXT,
        recording_id TEXT DEFAULT '',
        created_at TEXT,
        updated_at TEXT
    )""")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cache_hash ON analysis_cache(file_hash)")
    conn.commit()
    return conn


def find_audio_files(folder: Path) -> list[Path]:
    """Recursively find all audio files in a folder."""
    files = []
    for ext in SUPPORTED_EXTENSIONS:
        files.extend(folder.rglob(f"*{ext}"))
    return sorted(files)


def batch_analyze(folder: Path, db_path: str, dry_run: bool = False):
    """Analyze all audio files in a folder and cache results in local SQLite."""
    files = find_audio_files(folder)

    if not files:
        logger.warning(f"No audio files found in {folder}")
        return

    logger.info(f"Found {len(files)} audio files in {folder}")
    logger.info(f"Cache DB: {db_path}")

    db = _get_db(db_path)
    stats = {"total": len(files), "cached": 0, "analyzed": 0, "failed": 0}
    start_time = time.time()

    for i, file_path in enumerate(files, 1):
        name = file_path.name
        prefix = f"[{i}/{len(files)}]"

        try:
            file_hash = compute_file_hash(str(file_path))

            # Check if already in local cache
            existing = db.execute(
                "SELECT id FROM analysis_cache WHERE file_hash = ? LIMIT 1",
                (file_hash,)
            ).fetchone()
            if existing:
                stats["cached"] += 1
                if i % 100 == 0:
                    logger.info(f"{prefix} SKIP (cached): {name}")
                continue

            if dry_run:
                size_mb = file_path.stat().st_size / (1024 * 1024)
                logger.info(f"{prefix} WOULD ANALYZE: {name} ({size_mb:.1f}MB)")
                continue

            # Run analysis
            t0 = time.time()
            result = analyze_audio(str(file_path))
            elapsed = time.time() - t0

            # Fingerprint
            try:
                import acoustid
                _, fp_encoded = acoustid.fingerprint_file(str(file_path))
                fingerprint = fp_encoded.decode('utf-8') if isinstance(fp_encoded, bytes) else str(fp_encoded)
            except Exception:
                fingerprint = result.fingerprint or ""

            # Store in local SQLite
            sections_json = json.dumps([
                {"label": s.label, "start_time": s.start_time, "end_time": s.end_time, "confidence": s.confidence}
                for s in result.sections
            ])
            now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            file_size = file_path.stat().st_size

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
                    json.dumps(result.waveform_peaks), fingerprint,
                    "v2.2", result.analyzer_engine,
                    None, "", now, now,
                ),
            )
            db.commit()

            stats["analyzed"] += 1
            logger.info(f"{prefix} BPM={result.bpm:.0f} conf={result.confidence:.2f} {elapsed:.0f}s: {name}")

        except KeyboardInterrupt:
            logger.warning("\nInterrupted by user. Progress saved in cache.")
            break
        except Exception as e:
            logger.error(f"{prefix} FAILED: {name} — {e}")
            stats["failed"] += 1

    total_elapsed = time.time() - start_time
    db.close()

    logger.info("=" * 60)
    logger.info("Batch analysis complete!")
    logger.info(f"  Total files:    {stats['total']}")
    logger.info(f"  Analyzed:       {stats['analyzed']}")
    logger.info(f"  Already cached: {stats['cached']}")
    logger.info(f"  Failed:         {stats['failed']}")
    logger.info(f"  Time:           {total_elapsed/60:.1f} min")
    logger.info(f"  DB:             {db_path}")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Batch analyze audio files — LOCAL SQLite only, no Supabase."
    )
    parser.add_argument("folder", type=str, help="Path to folder containing audio files")
    parser.add_argument("--db-path", type=str, default=None,
                        help="SQLite DB path (default: server/analysis_cache.db)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without analyzing")

    args = parser.parse_args()
    folder = Path(args.folder).resolve()

    if not folder.exists() or not folder.is_dir():
        logger.error(f"Invalid folder: {folder}")
        sys.exit(1)

    db_path = args.db_path or str(Path(__file__).resolve().parent.parent / "analysis_cache.db")
    batch_analyze(folder, db_path, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
