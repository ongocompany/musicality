"""
Beat This! analyzer — alternative engine using Beat This! small0 model.

Replaces Madmom for beat/downbeat detection only.
Waveform, fingerprint, structure analysis reuse existing pipelines.

Usage:
  from services.beat_this_analyzer import analyze_audio_bt
  result = analyze_audio_bt("/path/to/audio.mp3")

Requirements:
  - beat_this package installed in venv
  - PyTorch 2.6+ safe globals patch (see below)
  - GPU with ~2.6GB VRAM (RTX 3080 10GB OK)
"""

import gc
import logging
import os
import subprocess
import tempfile

import numpy as np
import librosa
import acoustid
import torch

from models.schemas import AnalysisResult
from services.structure_analyzer import analyze_structure_with_phrases

logger = logging.getLogger(__name__)

# ── Engine identifier ────────────────────────────────────────────
ANALYZER_ENGINE_ID = "beat_this_small0_v1"

# ── BPM snap table (4931 Latin tracks, median BPMs) ─────────────
STANDARD_BPMS = [103.4, 107.7, 112.3, 117.5, 123.0, 129.2, 136.0, 143.6, 152.0, 161.5]

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}

# ── PyTorch 2.6+ safe globals for Beat This! checkpoint ─────────
try:
    torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])
except Exception:
    pass  # older PyTorch versions don't need this


def _extract_audio_from_video(video_path: str) -> str:
    """Extract audio from video via ffmpeg. Returns temp wav path."""
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    try:
        subprocess.run(
            ["ffmpeg", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
             "-ar", "22050", "-ac", "1", "-y", tmp.name],
            capture_output=True, check=True, timeout=60,
        )
        return tmp.name
    except Exception:
        os.unlink(tmp.name)
        raise


def _snap_bpm(raw_bpm: float) -> float:
    """Snap raw BPM to nearest standard Latin dance BPM."""
    if not STANDARD_BPMS:
        return round(raw_bpm, 1)
    nearest = min(STANDARD_BPMS, key=lambda x: abs(x - raw_bpm))
    # Only snap if within 5% of a standard BPM
    if abs(nearest - raw_bpm) / raw_bpm < 0.05:
        return nearest
    return round(raw_bpm, 1)


def _bpm_from_beats(beats: np.ndarray) -> float:
    """Calculate BPM from median beat interval."""
    if len(beats) < 2:
        return 0.0
    intervals = np.diff(beats)
    median_interval = float(np.median(intervals))
    if median_interval <= 0:
        return 0.0
    raw_bpm = 60.0 / median_interval
    return _snap_bpm(raw_bpm)


def _calculate_confidence(beats: np.ndarray, bpm: float) -> float:
    """Confidence from beat interval regularity."""
    if len(beats) < 4:
        return 0.3
    intervals = np.diff(beats)
    expected = 60.0 / bpm
    deviations = np.abs(intervals - expected) / expected
    mean_dev = float(np.mean(deviations))
    return max(0.3, min(1.0, 1.0 - (mean_dev * 3.5)))


def analyze_audio_bt(audio_path: str) -> AnalysisResult:
    """
    Analyze audio using Beat This! small0 model.

    Pipeline:
      1. Beat This! → beats + downbeats (~4s on GPU)
      2. BPM from median interval + snap table
      3. librosa → waveform peaks
      4. structure_analyzer → sections + phrase_boundaries
      5. acoustid → fingerprint
    """
    from beat_this.inference import File2Beats

    # 0. Video → audio extraction
    ext = os.path.splitext(audio_path)[1].lower()
    extracted_audio = None
    if ext in VIDEO_EXTENSIONS:
        extracted_audio = _extract_audio_from_video(audio_path)
        audio_path = extracted_audio

    try:
        # ── Step 1: Beat This! beat/downbeat detection ─────────────
        logger.info("[BT] Step 1/4: Beat This! small0 inference...")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        file2beats = File2Beats(checkpoint_path="small0", device=device)

        beats, downbeats = file2beats(audio_path)
        beats = np.array(beats, dtype=float)
        downbeats = np.array(downbeats, dtype=float)

        # Free GPU memory
        del file2beats
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        logger.info(f"[BT] Detected {len(beats)} beats, {len(downbeats)} downbeats")

        # ── Step 2: BPM + confidence ───────────────────────────────
        bpm = _bpm_from_beats(beats)
        confidence = _calculate_confidence(beats, bpm)
        beats_list = [round(float(b), 3) for b in beats]
        downbeats_list = [round(float(d), 3) for d in downbeats]

        # Determine beats_per_bar from downbeat spacing
        if len(downbeats) >= 2:
            db_intervals = np.diff(downbeats)
            median_db = float(np.median(db_intervals))
            median_beat = float(np.median(np.diff(beats))) if len(beats) >= 2 else median_db
            beats_per_bar = round(median_db / median_beat) if median_beat > 0 else 4
            beats_per_bar = max(3, min(6, beats_per_bar))  # clamp to 3-6
        else:
            beats_per_bar = 4

        # ── Step 3: Waveform + structure ───────────────────────────
        logger.info("[BT] Step 2/4: Waveform + structure analysis...")
        y, sr = librosa.load(audio_path, sr=22050)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Waveform peaks (200 samples)
        num_peaks = 200
        hop = max(1, len(y) // num_peaks)
        frames = [float(np.max(np.abs(y[i:i + hop]))) for i in range(0, len(y), hop)][:num_peaks]
        max_amp = max(frames) if frames else 1.0
        waveform_peaks = [round(f / max_amp, 3) for f in frames]

        del y
        gc.collect()

        # Structure analysis
        phrase_boundaries: list[float] = []
        try:
            sections, phrase_boundaries = analyze_structure_with_phrases(
                audio_path, duration, beats_list, downbeats_list
            )
        except Exception:
            sections = []

        # ── Step 4: Fingerprint ────────────────────────────────────
        logger.info("[BT] Step 3/4: Chromaprint fingerprint...")
        fingerprint = ""
        try:
            _, fp_encoded = acoustid.fingerprint_file(audio_path)
            fingerprint = fp_encoded.decode('utf-8') if isinstance(fp_encoded, bytes) else str(fp_encoded)
        except Exception:
            pass

        logger.info(f"[BT] Done! BPM={bpm}, beats={len(beats_list)}, downbeats={len(downbeats_list)}, sections={len(sections)}")

        return AnalysisResult(
            bpm=bpm,
            beats=beats_list,
            downbeats=downbeats_list,
            duration=round(duration, 3),
            beats_per_bar=beats_per_bar,
            confidence=round(confidence, 2),
            sections=sections,
            phrase_boundaries=phrase_boundaries,
            waveform_peaks=waveform_peaks,
            fingerprint=fingerprint,
            metadata=None,
            unstable_regions=[],
            analyzer_engine=ANALYZER_ENGINE_ID,
        )

    finally:
        if extracted_audio and os.path.exists(extracted_audio):
            os.unlink(extracted_audio)
