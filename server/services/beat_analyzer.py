import gc
import logging
import os
import subprocess
import tempfile

import numpy as np
import librosa
import acoustid
from madmom.features.beats import RNNBeatProcessor, DBNBeatTrackingProcessor
from madmom.features.downbeats import RNNDownBeatProcessor, DBNDownBeatTrackingProcessor

from models.schemas import AnalysisResult
from services.structure_analyzer import analyze_structure, analyze_structure_with_phrases
# Metadata lookup disabled — AcoustID/MusicBrainz rarely matches Latin dance remixes
# from services.metadata_lookup import lookup_metadata

logger = logging.getLogger(__name__)

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}

# ── Analysis mode flag ──────────────────────────────────────────
# True  = chunked mode (sequential load/unload, peak ~400MB)
# False = original mode (all in memory, peak ~1000MB)
# Set to False to revert to original behavior if chunked mode causes issues.
USE_CHUNKED_ANALYSIS = True


def _extract_audio_from_video(video_path: str) -> str:
    """
    Extract audio from a video file using ffmpeg.
    Returns path to temporary wav file (caller must delete).
    """
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


def analyze_audio(audio_path: str) -> AnalysisResult:
    """
    Analyze an audio/video file for beats, downbeats, and BPM.

    For video files (mp4, mov, etc.), extracts audio track first via ffmpeg.
    Uses Madmom (RNN + DBN) for beat/downbeat detection (state-of-the-art accuracy)
    and Librosa for BPM estimation and audio metadata.
    """

    # 0. If video file, extract audio first
    ext = os.path.splitext(audio_path)[1].lower()
    extracted_audio = None
    if ext in VIDEO_EXTENSIONS:
        extracted_audio = _extract_audio_from_video(audio_path)
        audio_path = extracted_audio

    try:
        if USE_CHUNKED_ANALYSIS:
            return _do_analysis_chunked(audio_path)
        else:
            return _do_analysis_original(audio_path)
    finally:
        if extracted_audio and os.path.exists(extracted_audio):
            os.unlink(extracted_audio)


# ══════════════════════════════════════════════════════════════════
# CHUNKED ANALYSIS (v2) — Sequential load/unload to reduce peak memory
# ══════════════════════════════════════════════════════════════════
#
# Problem:
#   Original analysis loads all processors simultaneously → peak ~1000MB per song.
#   10 concurrent requests = 10GB → server OOM/timeout.
#
# Solution:
#   Process each heavy step sequentially, releasing memory after each:
#     Step 1: Madmom Beat RNN (~400MB) → get beats → release
#     Step 2: Madmom Downbeat RNN (~300MB) → get downbeats → release
#     Step 3: librosa load (~150MB) → BPM + waveform + structure → release
#     Step 4: Chromaprint fingerprint (lightweight)
#
#   Peak memory: ~400MB (largest single step) instead of ~1000MB.
#   Same output, same accuracy — only memory usage changes.
#
# To revert: set USE_CHUNKED_ANALYSIS = False above.
# ══════════════════════════════════════════════════════════════════

def _do_analysis_chunked(audio_path: str) -> AnalysisResult:
    """
    Chunked analysis — processes each heavy step sequentially,
    freeing memory between steps. Peak ~400MB instead of ~1000MB.
    Same output as _do_analysis_original().
    """

    # ── Step 1: Beat detection (Madmom RNN) ─────────────────────
    # Peak memory: ~400MB (RNN model + activations)
    # Output: beats array (few KB)
    logger.info("[Analysis:chunked] Step 1/4: Beat detection (Madmom RNN)...")
    beat_rnn = RNNBeatProcessor()
    beat_dbn = DBNBeatTrackingProcessor(
        fps=100,
        min_bpm=80,
        max_bpm=230,  # covers both bachata (100-160) and salsa (150-220)
    )
    beat_activations = beat_rnn(audio_path)
    beats = beat_dbn(beat_activations)
    # Free RNN model + activations before loading next heavy model
    del beat_rnn, beat_dbn, beat_activations
    gc.collect()

    # ── Step 2: Downbeat detection (Madmom RNN) ─────────────────
    # Peak memory: ~300MB (separate RNN model)
    # Output: downbeats array + beats_per_bar (few KB)
    logger.info("[Analysis:chunked] Step 2/4: Downbeat detection (Madmom RNN)...")
    try:
        downbeat_rnn = RNNDownBeatProcessor()
        downbeat_dbn = DBNDownBeatTrackingProcessor(
            beats_per_bar=[3, 4],  # support 3/4 and 4/4 time
            fps=100,
        )
        downbeat_activations = downbeat_rnn(audio_path)
        downbeat_result = downbeat_dbn(downbeat_activations)

        # downbeat_result: [[time, beat_position], ...]
        # beat_position == 1 means downbeat
        downbeats = [float(row[0]) for row in downbeat_result if int(row[1]) == 1]

        # Determine beats_per_bar from the result
        if len(downbeat_result) > 0:
            max_beat_pos = int(max(row[1] for row in downbeat_result))
            beats_per_bar = max_beat_pos
        else:
            beats_per_bar = 4

        # Free RNN model + activations
        del downbeat_rnn, downbeat_dbn, downbeat_activations, downbeat_result
        gc.collect()
    except Exception:
        # Fallback: estimate downbeats from beats (every 4th beat)
        downbeats = [float(beats[i]) for i in range(0, len(beats), 4)]
        beats_per_bar = 4

    # ── Step 3: librosa — BPM, waveform, structure analysis ─────
    # Peak memory: ~300MB (audio array + feature extraction)
    # This is the ONLY librosa.load() call (no more double-loading).
    # structure_analyzer also calls librosa.load() internally — this is
    # unavoidable without refactoring structure_analyzer's interface.
    # TODO: Pass pre-loaded audio (y, sr) to structure_analyzer to eliminate double load.
    logger.info("[Analysis:chunked] Step 3/4: BPM + structure analysis (librosa)...")
    y, sr = librosa.load(audio_path, sr=22050)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # BPM estimation
    tempo = float(librosa.feature.tempo(y=y, sr=sr)[0])

    # Confidence
    confidence = _calculate_confidence(beats, tempo)

    # Waveform peaks for client visualization (200 samples)
    num_peaks = 200
    hop = max(1, len(y) // num_peaks)
    frames = [float(np.max(np.abs(y[i:i + hop]))) for i in range(0, len(y), hop)][:num_peaks]
    max_amp = max(frames) if frames else 1.0
    waveform_peaks = [round(f / max_amp, 3) for f in frames]

    # Free raw audio — no longer needed after waveform extraction
    del y
    gc.collect()

    # Structure analysis (section detection) + phrase boundaries
    beats_list = [round(float(b), 3) for b in beats]
    downbeats_list = [round(d, 3) for d in downbeats]
    phrase_boundaries: list[float] = []
    try:
        sections, phrase_boundaries = analyze_structure_with_phrases(
            audio_path, duration, beats_list, downbeats_list
        )
    except Exception:
        sections = []  # graceful degradation — beats still work without sections

    # ── Step 4: Fingerprint (lightweight, ~2s) ──────────────────
    logger.info("[Analysis:chunked] Step 4/4: Chromaprint fingerprint...")
    fingerprint = ""
    try:
        _, fp_encoded = acoustid.fingerprint_file(audio_path)
        fingerprint = fp_encoded.decode('utf-8') if isinstance(fp_encoded, bytes) else str(fp_encoded)
    except Exception:
        pass  # graceful degradation — fingerprint is optional

    metadata = None

    logger.info(f"[Analysis:chunked] Done! BPM={tempo:.1f}, beats={len(beats_list)}, sections={len(sections)}")

    return AnalysisResult(
        bpm=round(tempo, 1),
        beats=beats_list,
        downbeats=[round(d, 3) for d in downbeats],
        duration=round(duration, 3),
        beats_per_bar=beats_per_bar,
        confidence=round(confidence, 2),
        sections=sections,
        phrase_boundaries=phrase_boundaries,
        waveform_peaks=waveform_peaks,
        fingerprint=fingerprint,
        metadata=metadata,
    )


# ══════════════════════════════════════════════════════════════════
# ORIGINAL ANALYSIS (v1) — All in memory simultaneously
# ══════════════════════════════════════════════════════════════════
# Kept as fallback. Set USE_CHUNKED_ANALYSIS = False to use this.
# Peak memory: ~1000MB per song.

def _do_analysis_original(audio_path: str) -> AnalysisResult:
    """Original analysis — all processors loaded simultaneously. Peak ~1000MB."""

    # 1. Load audio with librosa for duration and BPM
    y, sr = librosa.load(audio_path, sr=22050)
    duration = float(librosa.get_duration(y=y, sr=sr))

    # 2. BPM estimation (librosa)
    tempo = float(librosa.feature.tempo(y=y, sr=sr)[0])

    # 3. Beat detection (madmom — more accurate than librosa)
    beat_rnn = RNNBeatProcessor()
    beat_dbn = DBNBeatTrackingProcessor(
        fps=100,
        min_bpm=80,
        max_bpm=230,  # covers both bachata (100-160) and salsa (150-220)
    )
    beat_activations = beat_rnn(audio_path)
    beats = beat_dbn(beat_activations)

    # 4. Downbeat detection (madmom)
    try:
        downbeat_rnn = RNNDownBeatProcessor()
        downbeat_dbn = DBNDownBeatTrackingProcessor(
            beats_per_bar=[3, 4],  # support 3/4 and 4/4 time
            fps=100,
        )
        downbeat_activations = downbeat_rnn(audio_path)
        downbeat_result = downbeat_dbn(downbeat_activations)

        # downbeat_result: [[time, beat_position], ...]
        # beat_position == 1 means downbeat
        downbeats = [float(row[0]) for row in downbeat_result if int(row[1]) == 1]

        # Determine beats_per_bar from the result
        if len(downbeat_result) > 0:
            max_beat_pos = int(max(row[1] for row in downbeat_result))
            beats_per_bar = max_beat_pos
        else:
            beats_per_bar = 4
    except Exception:
        # Fallback: estimate downbeats from beats (every 4th beat)
        downbeats = [float(beats[i]) for i in range(0, len(beats), 4)]
        beats_per_bar = 4

    # 5. Calculate confidence based on beat regularity
    confidence = _calculate_confidence(beats, tempo)

    # 6. Structure analysis (section detection) + phrase boundaries
    beats_list = [round(float(b), 3) for b in beats]
    downbeats_list = [round(d, 3) for d in downbeats]
    phrase_boundaries: list[float] = []
    try:
        sections, phrase_boundaries = analyze_structure_with_phrases(
            audio_path, duration, beats_list, downbeats_list
        )
    except Exception:
        sections = []  # graceful degradation — beats still work without sections

    # 7. Waveform peaks for client visualization (200 samples)
    num_peaks = 200
    hop = max(1, len(y) // num_peaks)
    frames = [float(np.max(np.abs(y[i:i + hop]))) for i in range(0, len(y), hop)][:num_peaks]
    max_amp = max(frames) if frames else 1.0
    waveform_peaks = [round(f / max_amp, 3) for f in frames]

    # 8. Audio fingerprint (Chromaprint) for track identification
    fingerprint = ""
    try:
        _, fp_encoded = acoustid.fingerprint_file(audio_path)
        fingerprint = fp_encoded.decode('utf-8') if isinstance(fp_encoded, bytes) else str(fp_encoded)
    except Exception:
        pass  # graceful degradation — fingerprint is optional

    # 9. Metadata lookup disabled — rarely matches Latin dance remixes, wastes API calls
    metadata = None

    return AnalysisResult(
        bpm=round(tempo, 1),
        beats=beats_list,
        downbeats=[round(d, 3) for d in downbeats],
        duration=round(duration, 3),
        beats_per_bar=beats_per_bar,
        confidence=round(confidence, 2),
        sections=sections,
        phrase_boundaries=phrase_boundaries,
        waveform_peaks=waveform_peaks,
        fingerprint=fingerprint,
        metadata=metadata,
    )


def _calculate_confidence(beats: np.ndarray, bpm: float) -> float:
    """
    Estimate confidence based on how regular the beat intervals are.
    Perfect regularity = 1.0, high variance = lower confidence.
    """
    if len(beats) < 4:
        return 0.3

    intervals = np.diff(beats)
    expected_interval = 60.0 / bpm

    # How close are the intervals to the expected interval?
    deviations = np.abs(intervals - expected_interval) / expected_interval
    mean_deviation = float(np.mean(deviations))

    # Map deviation to confidence: 0% deviation = 1.0, 20%+ deviation = 0.3
    confidence = max(0.3, min(1.0, 1.0 - (mean_deviation * 3.5)))
    return confidence
