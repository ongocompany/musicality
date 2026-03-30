#!/usr/bin/env python3
"""
Extract .beats labels from pnote human annotations.

Key difference from v1: uses pnote phrases.boundaries[1] as the true
first downbeat, NOT Madmom's downbeat output. This is the "dancer's 1"
— the point where actual dancing begins after intro.

Usage:
    python scripts/prepare_pnote_labels.py \
        --output-dir /mnt/nvme/finetune_v2 \
        --val-ratio 0.2
"""
import argparse
import json
import logging
import random
from pathlib import Path

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"
DATASET_NAME = "latin_pnote"


def fetch_pnotes():
    """Fetch all pnotes from tela crew."""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint, title").eq("crew_id", CREW_ID).execute()
    thread_map = {t["id"]: t for t in threads.data}

    all_ids = list(thread_map.keys())
    pnotes = []
    for i in range(0, len(all_ids), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", all_ids[i:i+50]).execute()
        pnotes.extend(resp.data)

    result = []
    for pn in pnotes:
        tid = pn["thread_id"]
        thread = thread_map.get(tid)
        if not thread:
            continue
        data = pn["phrase_note_data"]
        if not data or "phrases" not in data or "analysis" not in data:
            continue
        result.append({
            "fingerprint": thread.get("fingerprint", ""),
            "title": data.get("metadata", {}).get("title", "Unknown"),
            "beats": data["analysis"]["beats"],
            "downbeats": data["analysis"]["downbeats"],
            "boundaries": data["phrases"]["boundaries"],
            "bpp": int(data["phrases"].get("beatsPerPhrase", 32)),
            "bpm": float(data["music"].get("bpm", 120)),
        })
    logger.info(f"Fetched {len(result)} pnotes")
    return result


def pnote_to_beats_annotation(pnote: dict) -> list[tuple[float, int]]:
    """
    Convert pnote to .beats annotation using dancer's first downbeat.

    The dancer's "1" is at phrases.boundaries[1] — the start of the
    second phrase (first phrase is intro/preparation).

    From that anchor, we assign beat_position 1-4 cycling forward,
    and reverse-calculate positions for beats before the anchor.
    """
    beats = pnote["beats"]
    boundaries = pnote["boundaries"]

    if len(beats) < 8 or len(boundaries) < 2:
        return []

    # Anchor: boundaries[1] is the first downbeat (dancer's "1")
    anchor_idx = boundaries[1]
    if anchor_idx >= len(beats):
        anchor_idx = 0

    beats_per_bar = 4  # bachata is always 4/4

    annotations = []
    for i, beat_time in enumerate(beats):
        # Calculate position relative to anchor
        offset = i - anchor_idx
        position = (offset % beats_per_bar) + 1  # 1, 2, 3, 4
        annotations.append((round(beat_time, 6), position))

    return annotations


def write_beats_file(annotations: list[tuple[float, int]], path: Path):
    """Write .beats file in Beat This! format."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for time, pos in annotations:
            f.write(f"{time:.6f}\t{pos}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    output = Path(args.output_dir)
    ann_dir = output / "annotations" / DATASET_NAME
    beats_dir = ann_dir / "annotations" / "beats"
    beats_dir.mkdir(parents=True, exist_ok=True)

    pnotes = fetch_pnotes()

    # Filter: need fingerprint and enough beats
    valid = [p for p in pnotes if p["fingerprint"] and len(p["beats"]) >= 16 and len(p["boundaries"]) >= 2]
    logger.info(f"Valid pnotes: {len(valid)}/{len(pnotes)}")

    # Shuffle and split
    random.shuffle(valid)
    n_val = max(1, int(len(valid) * args.val_ratio))
    val_set = set(id(p) for p in valid[:n_val])
    logger.info(f"Train: {len(valid) - n_val}, Val: {n_val}")

    # Write annotations + split file
    split_lines = []
    stats = {"total": 0, "skipped": 0}

    for pnote in valid:
        # Use fingerprint prefix as stem (unique, filesystem-safe)
        stem = pnote["fingerprint"][:32]
        annotations = pnote_to_beats_annotation(pnote)
        if len(annotations) < 16:
            stats["skipped"] += 1
            continue

        write_beats_file(annotations, beats_dir / f"{stem}.beats")

        split = "val" if id(pnote) in val_set else "train"
        split_lines.append(f"{stem}\t{split}")
        stats["total"] += 1

    # Write split file
    with open(ann_dir / "single.split", "w") as f:
        f.write("\n".join(split_lines) + "\n")

    # Write info.json
    with open(ann_dir / "info.json", "w") as f:
        json.dump({"has_downbeats": True}, f)

    logger.info(f"Done! {stats['total']} annotations written, {stats['skipped']} skipped")
    logger.info(f"Train/Val split: {sum(1 for l in split_lines if 'train' in l)}/{sum(1 for l in split_lines if 'val' in l)}")
    logger.info(f"Output: {ann_dir}")

    # Print sample for verification
    sample = valid[0] if valid else None
    if sample:
        ann = pnote_to_beats_annotation(sample)
        logger.info(f"\nSample: {sample['title']}")
        logger.info(f"  BPM: {sample['bpm']}, Beats: {len(sample['beats'])}, Boundaries: {sample['boundaries'][:5]}...")
        logger.info(f"  Anchor (boundaries[1]): beat index {sample['boundaries'][1]}")
        logger.info(f"  First 12 annotations:")
        for t, p in ann[:12]:
            marker = " ← DOWNBEAT (dancer's 1)" if p == 1 else ""
            logger.info(f"    {t:.3f}s  beat_pos={p}{marker}")


if __name__ == "__main__":
    main()
