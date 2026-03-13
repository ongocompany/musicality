#!/usr/bin/env python3
"""
Batch analysis script — pre-analyze music files to fill the cache.
Analyzed songs are instantly available to all users via fingerprint matching.

Usage:
    cd server
    source venv/bin/activate
    python scripts/batch_analyze.py /path/to/music-folder/
    python scripts/batch_analyze.py /path/to/music-folder/ --delete-after  # delete files after analysis
    python scripts/batch_analyze.py /path/to/music-folder/ --dry-run      # preview without analyzing

Supported formats: mp3, wav, flac, m4a, aac, ogg
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

# Add parent dir to path so we can import server modules
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from services.analysis_cache import compute_file_hash, lookup_cache, store_in_cache
from services.beat_analyzer import analyze_audio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg"}


def find_audio_files(folder: Path) -> list[Path]:
    """Recursively find all audio files in a folder."""
    files = []
    for ext in SUPPORTED_EXTENSIONS:
        files.extend(folder.rglob(f"*{ext}"))
    return sorted(files)


def batch_analyze(folder: Path, delete_after: bool = False, dry_run: bool = False):
    """Analyze all audio files in a folder and cache results."""
    files = find_audio_files(folder)

    if not files:
        logger.warning(f"No audio files found in {folder}")
        return

    logger.info(f"Found {len(files)} audio files in {folder}")

    stats = {"total": len(files), "cached": 0, "analyzed": 0, "failed": 0, "skipped": 0}

    for i, file_path in enumerate(files, 1):
        name = file_path.name
        prefix = f"[{i}/{len(files)}]"

        try:
            # Check if already cached by hash
            file_hash = compute_file_hash(str(file_path))
            cached = lookup_cache(file_hash)

            if cached is not None:
                logger.info(f"{prefix} SKIP (already cached): {name}")
                stats["skipped"] += 1
                continue

            if dry_run:
                size_mb = file_path.stat().st_size / (1024 * 1024)
                logger.info(f"{prefix} WOULD ANALYZE: {name} ({size_mb:.1f}MB)")
                continue

            # Run full analysis
            logger.info(f"{prefix} ANALYZING: {name}...")
            start = time.time()
            result = analyze_audio(str(file_path))
            elapsed = time.time() - start

            # Store in cache
            file_size = file_path.stat().st_size
            result.file_hash = file_hash
            store_in_cache(file_hash, file_size, result)

            bpm = result.bpm
            fp_status = "yes" if result.fingerprint else "no"
            logger.info(
                f"{prefix} DONE: {name} — "
                f"BPM={bpm}, fingerprint={fp_status}, {elapsed:.1f}s"
            )
            stats["analyzed"] += 1

            # Delete source file if requested
            if delete_after:
                file_path.unlink()
                logger.info(f"{prefix} DELETED: {name}")

        except KeyboardInterrupt:
            logger.warning("\nInterrupted by user. Progress saved in cache.")
            break
        except Exception as e:
            logger.error(f"{prefix} FAILED: {name} — {e}")
            stats["failed"] += 1

    # Summary
    logger.info("=" * 60)
    logger.info("Batch analysis complete!")
    logger.info(f"  Total files:  {stats['total']}")
    logger.info(f"  Analyzed:     {stats['analyzed']}")
    logger.info(f"  Already cached: {stats['skipped']}")
    logger.info(f"  Failed:       {stats['failed']}")
    if dry_run:
        logger.info("  (Dry run — no files were actually analyzed)")
    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Batch analyze audio files and fill the analysis cache."
    )
    parser.add_argument(
        "folder",
        type=str,
        help="Path to folder containing audio files (recursive search)",
    )
    parser.add_argument(
        "--delete-after",
        action="store_true",
        help="Delete audio files after successful analysis",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview files without analyzing",
    )

    args = parser.parse_args()
    folder = Path(args.folder).resolve()

    if not folder.exists():
        logger.error(f"Folder not found: {folder}")
        sys.exit(1)

    if not folder.is_dir():
        logger.error(f"Not a directory: {folder}")
        sys.exit(1)

    batch_analyze(folder, delete_after=args.delete_after, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
