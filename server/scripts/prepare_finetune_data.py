#!/usr/bin/env python3
"""
Prepare fine-tuning data for Beat This! from Madmom analysis cache.

Converts Madmom cache DB results into Beat This! training format:
  - .beats annotation files (time + beat_position)
  - mel spectrograms (.npy) via Beat This!'s LogMelSpect
  - info.json + single.split for BeatDataModule

Usage:
    python scripts/prepare_finetune_data.py \
        --cache-db /home/jinwoo/musicality/server/analysis_cache.db \
        --audio-dir /mnt/nvme/batch_analyze/done \
        --output-dir /mnt/nvme/finetune_data \
        --min-confidence 0.9 \
        --val-ratio 0.1
"""
import argparse
import json
import logging
import random
import sqlite3
import sys
import time
from pathlib import Path

import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)


def load_cache_entries(db_path: str, min_confidence: float) -> list[dict]:
    """Load high-confidence entries from Madmom cache DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT file_hash, bpm, beats, downbeats, duration, beats_per_bar, confidence "
        "FROM analysis_cache WHERE confidence >= ? ORDER BY confidence DESC",
        (min_confidence,),
    )
    entries = []
    for row in cur.fetchall():
        entries.append({
            "file_hash": row["file_hash"],
            "bpm": row["bpm"],
            "beats": json.loads(row["beats"]),
            "downbeats": json.loads(row["downbeats"]),
            "duration": row["duration"],
            "beats_per_bar": row["beats_per_bar"],
            "confidence": row["confidence"],
        })
    conn.close()
    logger.info(f"Loaded {len(entries)} entries with confidence >= {min_confidence}")
    return entries


def find_audio_file(audio_dir: Path, file_hash: str, audio_files_map: dict) -> Path | None:
    """Find audio file matching a file_hash."""
    return audio_files_map.get(file_hash)


def build_audio_hash_map(audio_dir: Path) -> dict:
    """Build hash -> filepath map by computing SHA-256 of audio files."""
    import hashlib
    hash_map = {}
    files = list(audio_dir.glob("*.mp3"))
    logger.info(f"Building hash map for {len(files)} audio files...")
    for i, fp in enumerate(files):
        if i % 200 == 0 and i > 0:
            logger.info(f"  Hashed {i}/{len(files)} files...")
        h = hashlib.sha256(fp.read_bytes()).hexdigest()
        hash_map[h] = fp
    logger.info(f"Hash map built: {len(hash_map)} files")
    return hash_map


def beats_to_annotation(beats: list[float], downbeats: list[float], beats_per_bar: int) -> list[tuple[float, int]]:
    """
    Convert beats + downbeats to Beat This! annotation format.
    Returns list of (time, beat_position) where beat_position=1 is downbeat.
    """
    downbeat_set = set()
    for db in downbeats:
        # Find nearest beat within 50ms tolerance
        min_dist = float("inf")
        nearest = None
        for b in beats:
            dist = abs(b - db)
            if dist < min_dist:
                min_dist = dist
                nearest = b
        if nearest is not None and min_dist < 0.05:
            downbeat_set.add(nearest)

    annotations = []
    beat_pos = 1
    for b in sorted(beats):
        if b in downbeat_set:
            beat_pos = 1
        annotations.append((b, beat_pos))
        beat_pos += 1
        if beat_pos > beats_per_bar:
            beat_pos = 1

    return annotations


def generate_spectrogram(audio_path: Path, device="cpu"):
    """Generate mel spectrogram using Beat This!'s LogMelSpect."""
    import torch
    from beat_this.preprocessing import LogMelSpect, load_audio
    import soxr

    signal, sr = load_audio(str(audio_path))
    if signal.ndim == 2:
        signal = signal.mean(1)
    if sr != 22050:
        signal = soxr.resample(signal, in_rate=sr, out_rate=22050)

    spect_transform = LogMelSpect(device=device)
    signal_tensor = torch.tensor(signal, dtype=torch.float32, device=device)
    spect = spect_transform(signal_tensor)
    return spect.cpu().numpy()


def main():
    parser = argparse.ArgumentParser(description="Prepare Beat This! fine-tuning data from Madmom cache")
    parser.add_argument("--cache-db", required=True, help="Path to mac_mini_cache.db")
    parser.add_argument("--audio-dir", required=True, help="Directory with analyzed mp3 files")
    parser.add_argument("--output-dir", required=True, help="Output directory for training data")
    parser.add_argument("--min-confidence", type=float, default=0.9, help="Minimum Madmom confidence (default: 0.9)")
    parser.add_argument("--val-ratio", type=float, default=0.1, help="Validation split ratio (default: 0.1)")
    parser.add_argument("--max-songs", type=int, default=0, help="Max songs to process (0=all)")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    audio_dir = Path(args.audio_dir)
    dataset_name = "latin_dance"

    # Create output directory structure
    spect_dir = output_dir / "audio" / "spectrograms" / dataset_name
    annot_dir = output_dir / "annotations" / dataset_name / "annotations" / "beats"
    spect_dir.mkdir(parents=True, exist_ok=True)
    annot_dir.mkdir(parents=True, exist_ok=True)

    # Load cache entries
    entries = load_cache_entries(args.cache_db, args.min_confidence)
    if not entries:
        logger.error("No entries found in cache DB!")
        sys.exit(1)

    # Build audio file hash map
    hash_map = build_audio_hash_map(audio_dir)

    # Match entries to audio files
    matched = []
    for entry in entries:
        audio_path = hash_map.get(entry["file_hash"])
        if audio_path:
            matched.append((entry, audio_path))

    logger.info(f"Matched {len(matched)}/{len(entries)} entries to audio files")

    if not matched:
        logger.error("No audio files matched! Check audio-dir path.")
        sys.exit(1)

    if args.max_songs > 0:
        matched = matched[:args.max_songs]
        logger.info(f"Limited to {args.max_songs} songs")

    # Process each song
    item_names = []
    processed = 0
    failed = 0
    start_time = time.time()

    for i, (entry, audio_path) in enumerate(matched):
        stem = audio_path.stem  # e.g. "xyzABCdef"
        item_name = f"{dataset_name}/{stem}"

        try:
            # 1. Generate .beats annotation
            annotations = beats_to_annotation(
                entry["beats"], entry["downbeats"], entry["beats_per_bar"]
            )
            beats_file = annot_dir / f"{stem}.beats"
            with open(beats_file, "w") as f:
                for t, pos in annotations:
                    f.write(f"{t:.3f}\t{pos}\n")

            # 2. Generate spectrogram
            spect_file = spect_dir / stem / "track.npy"
            spect_file.parent.mkdir(parents=True, exist_ok=True)

            if not spect_file.exists():
                spect = generate_spectrogram(audio_path)
                np.save(spect_file, spect)

            item_names.append((item_name, stem))
            processed += 1

            if (i + 1) % 50 == 0:
                elapsed = time.time() - start_time
                rate = processed / elapsed
                remaining = (len(matched) - i - 1) / rate if rate > 0 else 0
                logger.info(f"  [{i+1}/{len(matched)}] {processed} done, {failed} failed "
                            f"({rate:.1f} songs/min, ~{remaining/60:.0f}min remaining)")

        except Exception as e:
            failed += 1
            logger.warning(f"  [{i+1}/{len(matched)}] Failed {stem}: {e}")
            continue

    # Create info.json
    info = {"has_downbeats": True}
    info_path = output_dir / "annotations" / dataset_name / "info.json"
    with open(info_path, "w") as f:
        json.dump(info, f)

    # Create train/val split
    random.seed(42)
    random.shuffle(item_names)
    val_count = max(1, int(len(item_names) * args.val_ratio))
    val_items = item_names[:val_count]
    train_items = item_names[val_count:]

    split_path = output_dir / "annotations" / dataset_name / "single.split"
    with open(split_path, "w") as f:
        for _, stem in train_items:
            f.write(f"{stem}\ttrain\n")
        for _, stem in val_items:
            f.write(f"{stem}\tval\n")

    elapsed = time.time() - start_time
    logger.info(f"\nDone! {processed} songs processed, {failed} failed in {elapsed:.0f}s")
    logger.info(f"  Train: {len(train_items)}, Val: {len(val_items)}")
    logger.info(f"  Output: {output_dir}")
    logger.info(f"  Annotations: {annot_dir}")
    logger.info(f"  Spectrograms: {spect_dir}")


if __name__ == "__main__":
    main()
