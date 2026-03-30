#!/usr/bin/env python3
"""
Generate mel spectrograms for Beat This! fine-tuning.

Strategy: match pnote song titles to audio filenames in batch_analyze/done/.
Uses librosa for audio loading (torchaudio 2.10 requires torchcodec for mp3).

Usage:
    python scripts/generate_spectrograms.py \
        --annotations-dir /mnt/nvme/finetune_v2/annotations/latin_pnote \
        --audio-dir /mnt/nvme/batch_analyze/done \
        --output-dir /mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote
"""
import argparse
import json
import logging
import re
import unicodedata
from pathlib import Path

import numpy as np
import torch
import librosa

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"


def normalize_for_match(s: str) -> str:
    """Normalize string for fuzzy matching: lowercase, strip accents, keep alphanum."""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[^a-z0-9]", "", s)
    return s


def fetch_pnote_titles() -> dict[str, str]:
    """Fetch stem → title mapping from pnotes. stem = fingerprint[:32]."""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint, title").eq("crew_id", CREW_ID).execute()
    thread_map = {t["id"]: t for t in threads.data}

    all_ids = list(thread_map.keys())
    pnotes = []
    for i in range(0, len(all_ids), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", all_ids[i:i+50]).execute()
        pnotes.extend(resp.data)

    stem_to_title = {}
    for pn in pnotes:
        thread = thread_map.get(pn["thread_id"])
        if not thread or not thread.get("fingerprint"):
            continue
        data = pn.get("phrase_note_data", {})
        title = data.get("metadata", {}).get("title", "")
        if not title:
            title = thread.get("title", "")
        stem = thread["fingerprint"][:32]
        stem_to_title[stem] = title

    return stem_to_title


def load_stems(annotations_dir: Path) -> list[str]:
    """Load stem names from single.split file."""
    stems = []
    with open(annotations_dir / "single.split") as f:
        for line in f:
            parts = line.strip().split("\t")
            if parts:
                stems.append(parts[0])
    return stems


def build_title_to_audio_map(audio_dir: Path) -> dict[str, Path]:
    """Build normalized-filename → path map for all audio files."""
    audio_map = {}
    for fp in audio_dir.iterdir():
        if fp.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".webm"):
            key = normalize_for_match(fp.stem)
            audio_map[key] = fp
    logger.info(f"Indexed {len(audio_map)} audio files")
    return audio_map


def find_audio_by_title(title: str, audio_map: dict[str, Path]) -> Path | None:
    """Find audio file by matching song title against filenames.

    Uses strict matching to avoid false positives from common words
    like 'bachata', 'salsa', 'remix'.
    """
    norm_title = normalize_for_match(title)
    if not norm_title or len(norm_title) < 5:
        return None

    # Strategy 1: exact normalized match
    if norm_title in audio_map:
        return audio_map[norm_title]

    # Strategy 2: title fully contained in filename (title must be 8+ chars to avoid noise)
    if len(norm_title) >= 8:
        for key, path in audio_map.items():
            if norm_title in key:
                return path

    # Strategy 3: filename fully contained in title (filename must be 10+ chars)
    for key, path in audio_map.items():
        if len(key) >= 10 and key in norm_title:
            return path

    # Strategy 4: match "artist - title" pattern
    # Split title like "Chris Paradise - Cobarde" → try "chrisparadisecobarde"
    # Also try just the song part after " - "
    if " - " in title:
        parts = title.split(" - ", 1)
        artist_norm = normalize_for_match(parts[0])
        song_norm = normalize_for_match(parts[1])
        # Try artist+song combo (most specific)
        combo = artist_norm + song_norm
        if len(combo) >= 10:
            for key, path in audio_map.items():
                if combo in key or key in combo:
                    return path
        # Try just song name if unique enough
        if len(song_norm) >= 6:
            matches = [(key, path) for key, path in audio_map.items() if song_norm in key]
            if len(matches) == 1:  # only if unique match
                return matches[0][1]

    return None


def generate_spectrogram(audio_path: Path, output_dir: Path, stem: str) -> bool:
    """Generate mel spectrogram matching Beat This! specs using librosa."""
    from beat_this.preprocessing import LogMelSpect

    spec_dir = output_dir / stem
    spec_dir.mkdir(parents=True, exist_ok=True)
    out_path = spec_dir / "track.npy"

    if out_path.exists():
        return True

    try:
        # Load with librosa (handles mp3 natively via soundfile/ffmpeg)
        y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
        waveform = torch.from_numpy(y).float()

        transform = LogMelSpect()
        spec = transform(waveform)
        np.save(out_path, spec.numpy())
        return True
    except Exception as e:
        logger.warning(f"  Failed: {stem} — {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations-dir", required=True)
    parser.add_argument("--audio-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    ann_dir = Path(args.annotations_dir)
    audio_dir = Path(args.audio_dir)
    output_dir = Path(args.output_dir)

    # Load stems from split file
    stems = load_stems(ann_dir)
    logger.info(f"Loaded {len(stems)} stems")

    # Fetch pnote titles from Supabase
    stem_to_title = fetch_pnote_titles()
    logger.info(f"Fetched {len(stem_to_title)} pnote titles")

    # Build audio filename index (instant, no hashing)
    audio_map = build_title_to_audio_map(audio_dir)

    # Match and generate
    success = 0
    skipped = 0
    failed = 0
    not_found = []

    for i, stem in enumerate(stems):
        title = stem_to_title.get(stem, "")
        if not title:
            skipped += 1
            continue

        audio_path = find_audio_by_title(title, audio_map)
        if not audio_path:
            not_found.append(title)
            skipped += 1
            continue

        if (i + 1) % 10 == 0 or i == 0:
            logger.info(f"[{i+1}/{len(stems)}] {title[:40]} → {audio_path.name[:50]}")

        if generate_spectrogram(audio_path, output_dir, stem):
            success += 1
        else:
            failed += 1

    logger.info(f"\nDone! Success: {success}, Skipped: {skipped}, Failed: {failed}")

    if not_found:
        logger.info(f"\nNot found ({len(not_found)} titles):")
        for t in not_found[:20]:
            logger.info(f"  - {t}")
        if len(not_found) > 20:
            logger.info(f"  ... and {len(not_found) - 20} more")


if __name__ == "__main__":
    main()
