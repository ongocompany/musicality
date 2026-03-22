#!/usr/bin/env python3
"""
Evaluate fine-tuned Beat This! vs original Beat This! vs Madmom.

Picks N random songs from the cache DB, runs all three engines,
and compares beat/downbeat accuracy + speed.

Usage:
    python scripts/eval_finetune.py \
        --finetuned-model /mnt/nvme/finetune_checkpoints/latin_beat_this_final.ckpt \
        --audio-dir /mnt/nvme/batch_analyze/done \
        --cache-db /home/jinwoo/musicality/server/analysis_cache.db \
        --num-songs 20
"""
import argparse
import json
import logging
import sqlite3
import time
from pathlib import Path

import numpy as np
import torch
# PyTorch 2.6+ requires explicit allowlisting for numpy types in checkpoints
torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)


def load_madmom_truth(db_path: str, file_hash: str) -> dict | None:
    """Load Madmom results as ground truth from cache DB."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT beats, downbeats, bpm, confidence FROM analysis_cache WHERE file_hash = ?",
        (file_hash,),
    )
    row = cur.fetchone()
    conn.close()
    if row:
        return {
            "beats": json.loads(row["beats"]),
            "downbeats": json.loads(row["downbeats"]),
            "bpm": row["bpm"],
            "confidence": row["confidence"],
        }
    return None


def beats_f_measure(truth: list[float], pred: list[float], tolerance: float = 0.07) -> float:
    """
    Compute F-measure between truth and predicted beat timestamps.
    tolerance: allowed deviation in seconds (default 70ms, standard mir_eval).
    """
    if not truth or not pred:
        return 0.0

    truth = np.array(truth)
    pred = np.array(pred)

    # Count true positives
    tp = 0
    used_pred = set()
    for t in truth:
        dists = np.abs(pred - t)
        closest_idx = np.argmin(dists)
        if dists[closest_idx] <= tolerance and closest_idx not in used_pred:
            tp += 1
            used_pred.add(closest_idx)

    precision = tp / len(pred) if pred.size else 0
    recall = tp / len(truth) if truth.size else 0

    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


def run_beat_this(audio_path: str, checkpoint: str, device: str = "cpu") -> tuple[list[float], list[float], float]:
    """Run Beat This! inference, return (beats, downbeats, elapsed_seconds)."""
    from beat_this.inference import File2Beats
    # Monkey-patch torch.load to allow numpy globals (PyTorch 2.6+ compat)
    _original_load = torch.load
    torch.load = lambda *args, **kwargs: _original_load(*args, **{**kwargs, "weights_only": False})
    try:
        model = File2Beats(checkpoint_path=checkpoint, device=device, dbn=False)
        start = time.time()
        beats, downbeats = model(audio_path)
        elapsed = time.time() - start
        return [round(float(b), 3) for b in beats], [round(float(d), 3) for d in downbeats], elapsed
    finally:
        torch.load = _original_load


def run_madmom_live(audio_path: str) -> tuple[list[float], list[float], float]:
    """Run Madmom analysis, return (beats, downbeats, elapsed_seconds)."""
    from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
    from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor
    import gc

    start = time.time()

    # Beat detection
    beat_rnn = RNNBeatProcessor()
    beat_dbn = DBNBeatTrackingProcessor(fps=100, min_bpm=80, max_bpm=230)
    beat_activations = beat_rnn(audio_path)
    beats = beat_dbn(beat_activations)
    del beat_rnn, beat_dbn, beat_activations
    gc.collect()

    # Downbeat detection
    try:
        db_rnn = RNNDownBeatProcessor()
        db_dbn = DBNDownBeatTrackingProcessor(beats_per_bar=[3, 4], fps=100)
        db_activations = db_rnn(audio_path)
        db_result = db_dbn(db_activations)
        downbeats = [float(row[0]) for row in db_result if int(row[1]) == 1]
        del db_rnn, db_dbn, db_activations, db_result
        gc.collect()
    except Exception:
        downbeats = [float(beats[i]) for i in range(0, len(beats), 4)]

    elapsed = time.time() - start
    return [round(float(b), 3) for b in beats], [round(float(d), 3) for d in downbeats], elapsed


def main():
    parser = argparse.ArgumentParser(description="Evaluate fine-tuned Beat This! vs baselines")
    parser.add_argument("--finetuned-model", required=True, help="Path to fine-tuned checkpoint")
    parser.add_argument("--audio-dir", required=True, help="Directory with mp3 files")
    parser.add_argument("--cache-db", required=True, help="Path to Madmom cache DB")
    parser.add_argument("--num-songs", type=int, default=20, help="Number of test songs (default: 20)")
    parser.add_argument("--original-model", default="small0", help="Original Beat This! model (default: small0)")
    parser.add_argument("--skip-madmom-live", action="store_true", help="Skip live Madmom (use cached only)")
    args = parser.parse_args()

    audio_dir = Path(args.audio_dir)
    audio_files = list(audio_dir.glob("*.mp3"))

    if not audio_files:
        logger.error(f"No mp3 files found in {audio_dir}")
        return

    # Pick random subset
    import random
    random.seed(42)
    test_files = random.sample(audio_files, min(args.num_songs, len(audio_files)))

    # Build hash map for selected files
    import hashlib
    logger.info(f"Hashing {len(test_files)} test files...")
    file_hashes = {}
    for fp in test_files:
        h = hashlib.sha256(fp.read_bytes()).hexdigest()
        file_hashes[fp] = h

    # Results storage
    results = {
        "original_bt": {"beat_f": [], "db_f": [], "time": []},
        "finetuned_bt": {"beat_f": [], "db_f": [], "time": []},
    }
    if not args.skip_madmom_live:
        results["madmom_live"] = {"beat_f": [], "db_f": [], "time": []}

    logger.info(f"\nEvaluating {len(test_files)} songs...")
    logger.info("=" * 80)

    for i, fp in enumerate(test_files):
        file_hash = file_hashes[fp]
        madmom_truth = load_madmom_truth(args.cache_db, file_hash)

        if not madmom_truth:
            logger.warning(f"  [{i+1}] No Madmom cache for {fp.name}, skipping")
            continue

        truth_beats = madmom_truth["beats"]
        truth_downbeats = madmom_truth["downbeats"]

        logger.info(f"\n[{i+1}/{len(test_files)}] {fp.name} (BPM={madmom_truth['bpm']}, conf={madmom_truth['confidence']:.2f})")

        # 1. Original Beat This!
        try:
            bt_beats, bt_db, bt_time = run_beat_this(str(fp), args.original_model)
            bt_beat_f = beats_f_measure(truth_beats, bt_beats)
            bt_db_f = beats_f_measure(truth_downbeats, bt_db)
            results["original_bt"]["beat_f"].append(bt_beat_f)
            results["original_bt"]["db_f"].append(bt_db_f)
            results["original_bt"]["time"].append(bt_time)
            logger.info(f"  Original BT:  beat F={bt_beat_f:.3f}  db F={bt_db_f:.3f}  time={bt_time:.1f}s")
        except Exception as e:
            logger.warning(f"  Original BT failed: {e}")

        # 2. Fine-tuned Beat This!
        try:
            ft_beats, ft_db, ft_time = run_beat_this(str(fp), args.finetuned_model)
            ft_beat_f = beats_f_measure(truth_beats, ft_beats)
            ft_db_f = beats_f_measure(truth_downbeats, ft_db)
            results["finetuned_bt"]["beat_f"].append(ft_beat_f)
            results["finetuned_bt"]["db_f"].append(ft_db_f)
            results["finetuned_bt"]["time"].append(ft_time)
            logger.info(f"  Finetuned BT: beat F={ft_beat_f:.3f}  db F={ft_db_f:.3f}  time={ft_time:.1f}s")
        except Exception as e:
            logger.warning(f"  Finetuned BT failed: {e}")

        # 3. Madmom live (optional)
        if not args.skip_madmom_live:
            try:
                mm_beats, mm_db, mm_time = run_madmom_live(str(fp))
                mm_beat_f = beats_f_measure(truth_beats, mm_beats)
                mm_db_f = beats_f_measure(truth_downbeats, mm_db)
                results["madmom_live"]["beat_f"].append(mm_beat_f)
                results["madmom_live"]["db_f"].append(mm_db_f)
                results["madmom_live"]["time"].append(mm_time)
                logger.info(f"  Madmom live:  beat F={mm_beat_f:.3f}  db F={mm_db_f:.3f}  time={mm_time:.1f}s")
            except Exception as e:
                logger.warning(f"  Madmom live failed: {e}")

    # ── Summary ───────────────────────────────────────────────────
    logger.info("\n" + "=" * 80)
    logger.info("SUMMARY")
    logger.info("=" * 80)

    for engine, data in results.items():
        if data["beat_f"]:
            avg_beat_f = np.mean(data["beat_f"])
            avg_db_f = np.mean(data["db_f"])
            avg_time = np.mean(data["time"])
            logger.info(f"  {engine:20s}  beat F={avg_beat_f:.3f}  db F={avg_db_f:.3f}  avg time={avg_time:.1f}s")
        else:
            logger.info(f"  {engine:20s}  (no results)")

    # Speedup calculation
    if results["finetuned_bt"]["time"]:
        ft_avg = np.mean(results["finetuned_bt"]["time"])
        if not args.skip_madmom_live and results["madmom_live"]["time"]:
            mm_avg = np.mean(results["madmom_live"]["time"])
            logger.info(f"\n  Speedup (finetuned BT vs Madmom): {mm_avg/ft_avg:.1f}x faster")


if __name__ == "__main__":
    main()
