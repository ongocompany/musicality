#!/usr/bin/env python3
"""
Batch analyze all MP3 files in a directory.
Skips duplicates (same SHA-256 hash) and already-cached files.
Usage: python batch_analyze.py /path/to/mp3/folder [--dry-run] [--workers N]
"""

import argparse
import hashlib
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# Add parent dir to path so we can import server modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env before importing modules that use env vars
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from services.beat_analyzer import analyze_audio
from services.analysis_cache import compute_file_hash, lookup_cache, store_in_cache, compute_fingerprint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".wma"}


def find_audio_files(root_dir: str) -> list[Path]:
    """Recursively find all audio files."""
    files = []
    for dirpath, _, filenames in os.walk(root_dir):
        for f in filenames:
            ext = os.path.splitext(f)[1].lower()
            if ext in AUDIO_EXTENSIONS:
                files.append(Path(dirpath) / f)
    return sorted(files)


def process_file(file_path: Path, seen_hashes: set, stats: dict) -> str:
    """
    Analyze a single file. Returns status string.
    - 'cached': already in Supabase cache
    - 'duplicate': same hash as another file in this batch
    - 'analyzed': freshly analyzed
    - 'error': failed
    """
    filename = file_path.name
    try:
        # Step 1: Compute hash
        file_hash = compute_file_hash(str(file_path))

        # Step 2: Check if duplicate within this batch
        if file_hash in seen_hashes:
            stats["duplicates"] += 1
            return f"SKIP (duplicate) {filename}"
        seen_hashes.add(file_hash)

        # Step 3: Check Supabase cache
        cached = lookup_cache(file_hash)
        if cached is not None:
            stats["cached"] += 1
            return f"SKIP (cached)    {filename}"

        # Step 4: Run analysis
        file_size = file_path.stat().st_size
        t0 = time.time()
        result = analyze_audio(str(file_path))
        elapsed = time.time() - t0

        # Step 5: Compute fingerprint
        try:
            fp_duration, fp_string = compute_fingerprint(str(file_path))
            result.fingerprint = fp_string
        except Exception as e:
            logger.warning(f"Fingerprint failed for {filename}: {e}")

        # Step 6: Store in cache
        result.file_hash = file_hash
        store_in_cache(file_hash, file_size, result)
        stats["analyzed"] += 1

        return f"OK   ({elapsed:.1f}s, {result.bpm:.0f} BPM) {filename}"

    except Exception as e:
        stats["errors"] += 1
        return f"ERROR: {e} — {filename}"


def main():
    parser = argparse.ArgumentParser(description="Batch analyze audio files")
    parser.add_argument("directory", help="Root directory containing audio files")
    parser.add_argument("--dry-run", action="store_true", help="List files without analyzing")
    parser.add_argument("--workers", type=int, default=1, help="Parallel workers (default: 1, analysis is CPU-heavy)")
    args = parser.parse_args()

    root = args.directory
    if not os.path.isdir(root):
        print(f"Error: {root} is not a directory")
        sys.exit(1)

    # Find all audio files
    files = find_audio_files(root)
    print(f"\nFound {len(files)} audio files in {root}\n")

    if args.dry_run:
        for f in files:
            print(f"  {f}")
        return

    # Deduplicate pass: compute hashes first
    print("Phase 1: Computing hashes for deduplication...")
    hash_map: dict[str, Path] = {}  # hash -> first file with this hash
    unique_files: list[tuple[Path, str]] = []
    dup_count = 0

    for i, f in enumerate(files):
        file_hash = compute_file_hash(str(f))
        if file_hash in hash_map:
            dup_count += 1
            logger.info(f"  [{i+1}/{len(files)}] DUPLICATE: {f.name} == {hash_map[file_hash].name}")
        else:
            hash_map[file_hash] = f
            unique_files.append((f, file_hash))
        if (i + 1) % 100 == 0:
            print(f"  Hashed {i+1}/{len(files)} files...")

    print(f"\n  Total: {len(files)} files, {len(unique_files)} unique, {dup_count} duplicates\n")

    # Check cache for unique files
    print("Phase 2: Checking cache...")
    to_analyze: list[tuple[Path, str, int]] = []
    cached_count = 0

    for i, (f, file_hash) in enumerate(unique_files):
        cached = lookup_cache(file_hash)
        if cached is not None:
            cached_count += 1
        else:
            file_size = f.stat().st_size
            to_analyze.append((f, file_hash, file_size))
        if (i + 1) % 100 == 0:
            print(f"  Checked {i+1}/{len(unique_files)} files...")

    print(f"\n  Already cached: {cached_count}, Need analysis: {len(to_analyze)}\n")

    if not to_analyze:
        print("Nothing to analyze! All files are cached or duplicates.")
        return

    # Analyze
    print(f"Phase 3: Analyzing {len(to_analyze)} files...\n")
    success = 0
    errors = 0
    start_time = time.time()

    for i, (f, file_hash, file_size) in enumerate(to_analyze):
        try:
            t0 = time.time()
            result = analyze_audio(str(f))
            elapsed = time.time() - t0

            # Fingerprint
            try:
                _, fp_string = compute_fingerprint(str(f))
                result.fingerprint = fp_string
            except Exception:
                pass

            result.file_hash = file_hash
            store_in_cache(file_hash, file_size, result)
            success += 1

            total_elapsed = time.time() - start_time
            avg = total_elapsed / (i + 1)
            remaining = avg * (len(to_analyze) - i - 1)

            print(f"  [{i+1}/{len(to_analyze)}] OK ({elapsed:.1f}s, {result.bpm:.0f} BPM) {f.name}  [ETA: {remaining/60:.0f}m]")

        except Exception as e:
            errors += 1
            print(f"  [{i+1}/{len(to_analyze)}] ERROR: {e} — {f.name}")

    # Summary
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"DONE in {total_time/60:.1f} minutes")
    print(f"  Total files:  {len(files)}")
    print(f"  Duplicates:   {dup_count}")
    print(f"  Cached:       {cached_count}")
    print(f"  Analyzed:     {success}")
    print(f"  Errors:       {errors}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
