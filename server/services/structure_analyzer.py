"""
Music structure analyzer for Latin dance music.
Detects sections: intro, derecho, majao, mambo, bridge, outro.

Uses librosa spectral features + agglomerative clustering + heuristic classification.
MVP focus: find where intro ends and derecho begins.
"""

import numpy as np
import librosa
from models.schemas import SectionInfo


def analyze_structure(
    audio_path: str,
    duration: float,
    beats: list[float],
) -> list[SectionInfo]:
    """
    Detect music sections from audio file.

    Args:
        audio_path: Path to audio file
        duration: Track duration in seconds
        beats: Beat timestamps in seconds (from beat_analyzer)

    Returns:
        List of SectionInfo sorted by start_time
    """
    # 1. Load audio
    y, sr = librosa.load(audio_path, sr=22050)

    # 2. Compute features
    # MFCC for timbre similarity (13 coefficients)
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(S), n_mfcc=13)

    # RMS energy (loudness per frame)
    rms = librosa.feature.rms(y=y)[0]

    # Spectral centroid (brightness)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

    # Onset strength (rhythmic activity)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # 3. Find section boundaries via agglomerative clustering
    boundaries = _find_boundaries(mfcc, duration, sr)

    if len(boundaries) < 2:
        # Not enough boundaries — return single "derecho" section
        return [SectionInfo(
            label="derecho",
            start_time=0.0,
            end_time=round(duration, 3),
            confidence=0.3,
        )]

    # 4. Snap boundaries to nearest beats
    boundaries = _snap_to_beats(boundaries, beats)

    # 5. Compute per-segment features
    segments = _compute_segment_features(boundaries, duration, rms, centroid, onset_env, sr)

    # 6. Classify segments
    sections = _classify_segments(segments, duration)

    return sections


def _find_boundaries(
    mfcc: np.ndarray,
    duration: float,
    sr: int,
) -> list[float]:
    """
    Find section boundaries using agglomerative clustering on MFCCs.
    Tries k=4..8 and picks the best via boundary strength.
    """
    best_boundaries = []
    best_score = -1.0

    # Compute novelty curve for scoring
    novelty = np.sqrt(np.sum(np.diff(mfcc, axis=1) ** 2, axis=0))

    for k in range(4, 9):
        try:
            bounds = librosa.segment.agglomerative(mfcc, k=k)
            # Convert frame indices to times
            bound_times = librosa.frames_to_time(bounds, sr=sr)

            # Score: sum of novelty at boundary points
            score = 0.0
            for b in bounds:
                if 0 < b < len(novelty):
                    # Average novelty in small window around boundary
                    start = max(0, b - 2)
                    end = min(len(novelty), b + 3)
                    score += float(np.mean(novelty[start:end]))

            if score > best_score:
                best_score = score
                best_boundaries = bound_times.tolist()

        except Exception:
            continue

    # Filter out boundaries too close to start/end (< 2 seconds)
    best_boundaries = [b for b in best_boundaries if 2.0 < b < duration - 2.0]

    # Remove boundaries too close together (< 5 seconds apart)
    if best_boundaries:
        filtered = [best_boundaries[0]]
        for b in best_boundaries[1:]:
            if b - filtered[-1] >= 5.0:
                filtered.append(b)
        best_boundaries = filtered

    return sorted(best_boundaries)


def _snap_to_beats(boundaries: list[float], beats: list[float]) -> list[float]:
    """Snap each boundary to the nearest beat timestamp."""
    if not beats:
        return boundaries

    beats_arr = np.array(beats)
    snapped = []
    for b in boundaries:
        idx = np.argmin(np.abs(beats_arr - b))
        snapped.append(float(beats_arr[idx]))
    return sorted(set(snapped))  # deduplicate


def _compute_segment_features(
    boundaries: list[float],
    duration: float,
    rms: np.ndarray,
    centroid: np.ndarray,
    onset_env: np.ndarray,
    sr: int,
) -> list[dict]:
    """
    Compute aggregate features for each segment defined by boundaries.
    Returns list of dicts with start, end, and feature values.
    """
    # Build full boundary list including 0 and duration
    all_bounds = [0.0] + list(boundaries) + [duration]

    hop_length = 512  # librosa default
    segments = []

    for i in range(len(all_bounds) - 1):
        start = all_bounds[i]
        end = all_bounds[i + 1]

        # Convert time to frame indices
        start_frame = int(start * sr / hop_length)
        end_frame = int(end * sr / hop_length)

        # Clamp to array bounds
        start_frame = max(0, min(start_frame, len(rms) - 1))
        end_frame = max(start_frame + 1, min(end_frame, len(rms)))

        # Aggregate features
        seg_rms = float(np.mean(rms[start_frame:end_frame])) if end_frame > start_frame else 0.0
        seg_centroid = float(np.mean(centroid[start_frame:end_frame])) if end_frame > start_frame else 0.0

        # Onset density: onsets per second
        onset_start = max(0, min(start_frame, len(onset_env) - 1))
        onset_end = max(onset_start + 1, min(end_frame, len(onset_env)))
        seg_onset = float(np.mean(onset_env[onset_start:onset_end])) if onset_end > onset_start else 0.0

        seg_duration = end - start

        segments.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(seg_duration, 3),
            "rms": seg_rms,
            "centroid": seg_centroid,
            "onset_density": seg_onset,
        })

    return segments


def _classify_segments(segments: list[dict], duration: float) -> list[SectionInfo]:
    """
    Classify segments into Latin dance section labels using heuristic rules.

    Priority: find intro end (= derecho start). Other labels are bonus.
    """
    if not segments:
        return []

    # Normalize features to [0, 1] within the track
    rms_values = [s["rms"] for s in segments]
    centroid_values = [s["centroid"] for s in segments]
    onset_values = [s["onset_density"] for s in segments]

    rms_min, rms_max = min(rms_values), max(rms_values)
    cent_min, cent_max = min(centroid_values), max(centroid_values)
    onset_min, onset_max = min(onset_values), max(onset_values)

    def norm(val, vmin, vmax):
        if vmax - vmin < 1e-8:
            return 0.5
        return (val - vmin) / (vmax - vmin)

    for s in segments:
        s["rms_n"] = norm(s["rms"], rms_min, rms_max)
        s["centroid_n"] = norm(s["centroid"], cent_min, cent_max)
        s["onset_n"] = norm(s["onset_density"], onset_min, onset_max)

    # Classification pass
    labels = ["derecho"] * len(segments)  # default everything to derecho
    confidences = [0.5] * len(segments)

    # Rule 1: Intro — first segment if low energy
    if segments[0]["rms_n"] < 0.45:
        labels[0] = "intro"
        confidences[0] = 0.7 + (0.45 - segments[0]["rms_n"])  # higher conf for lower energy
    elif segments[0]["duration"] < 10 and len(segments) > 2:
        # Very short first segment — likely intro even with moderate energy
        labels[0] = "intro"
        confidences[0] = 0.5

    # Rule 2: Outro — last segment if low or declining energy
    if len(segments) > 1:
        last = segments[-1]
        prev = segments[-2]
        if last["rms_n"] < 0.4 or (last["rms"] < prev["rms"] * 0.7):
            labels[-1] = "outro"
            confidences[-1] = 0.6

    # Rule 3: Mambo — highest energy + high brightness (instrumental solo)
    # Only consider middle segments (not first/last)
    if len(segments) > 3:
        mid_indices = list(range(1, len(segments) - 1))
        # Find segment with highest combined energy + brightness
        best_mambo = max(mid_indices, key=lambda i: segments[i]["rms_n"] * 0.6 + segments[i]["centroid_n"] * 0.4)
        if segments[best_mambo]["rms_n"] > 0.65 and segments[best_mambo]["centroid_n"] > 0.5:
            labels[best_mambo] = "mambo"
            confidences[best_mambo] = min(0.9, segments[best_mambo]["rms_n"])

    # Rule 4: Majao — high onset density, moderate-high energy (syncopated section)
    for i in range(1, len(segments) - 1):
        if labels[i] != "derecho":
            continue
        s = segments[i]
        if s["onset_n"] > 0.6 and s["rms_n"] > 0.5 and s["centroid_n"] < 0.6:
            labels[i] = "majao"
            confidences[i] = 0.5 + s["onset_n"] * 0.3

    # Rule 5: Bridge — short low-energy segment between higher-energy sections
    for i in range(1, len(segments) - 1):
        if labels[i] != "derecho":
            continue
        s = segments[i]
        if s["duration"] < 15 and s["rms_n"] < 0.4:
            prev_rms = segments[i - 1]["rms_n"]
            next_rms = segments[i + 1]["rms_n"] if i + 1 < len(segments) else 0
            if prev_rms > 0.5 or next_rms > 0.5:
                labels[i] = "bridge"
                confidences[i] = 0.5

    # Build result
    sections = []
    for i, s in enumerate(segments):
        sections.append(SectionInfo(
            label=labels[i],
            start_time=s["start"],
            end_time=s["end"],
            confidence=round(min(1.0, confidences[i]), 2),
        ))

    return sections
