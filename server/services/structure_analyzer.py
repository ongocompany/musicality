"""
Music structure analyzer for Latin dance music (v2).
Detects sections: intro, derecho, majao, mambo, bridge, outro.

v2 improvements over v1:
- Multi-feature self-similarity matrix (MFCC + chroma + spectral contrast)
- Checkerboard kernel convolution for boundary detection
- Harmonic-percussive source separation (percussion entry = derecho start)
- Band-specific energy analysis (low/mid/high frequency)
- Phrase-aligned boundary snapping (4-bar phrases via downbeats)
- Enhanced classification heuristics for Latin music

MVP focus: find where intro ends and derecho begins.
"""

import numpy as np
import librosa
from scipy.ndimage import median_filter
from models.schemas import SectionInfo


def analyze_structure(
    audio_path: str,
    duration: float,
    beats: list[float],
    downbeats: list[float] | None = None,
) -> list[SectionInfo]:
    """
    Detect music sections from audio file.

    Args:
        audio_path: Path to audio file
        duration: Track duration in seconds
        beats: Beat timestamps in seconds
        downbeats: Downbeat (bar start) timestamps in seconds

    Returns:
        List of SectionInfo sorted by start_time
    """
    # 1. Load audio
    y, sr = librosa.load(audio_path, sr=22050)
    hop_length = 512

    # 2. Harmonic-Percussive Source Separation
    y_harmonic, y_percussive = librosa.effects.hpss(y)

    # 3. Compute multi-dimensional features
    features = _compute_features(y, y_harmonic, y_percussive, sr, hop_length)

    # 4. Find boundaries via self-similarity + checkerboard kernel
    boundaries = _find_boundaries_ssm(features, duration, sr, hop_length)

    # Also get agglomerative boundaries as fallback/supplement
    agg_boundaries = _find_boundaries_agglomerative(features["mfcc"], duration, sr)

    # Merge both boundary sets
    boundaries = _merge_boundaries(boundaries, agg_boundaries, min_gap=5.0)

    if len(boundaries) < 1:
        return [SectionInfo(
            label="derecho",
            start_time=0.0,
            end_time=round(duration, 3),
            confidence=0.3,
        )]

    # 5. Snap boundaries to downbeats (phrase-aligned) or beats
    boundaries = _snap_to_phrases(boundaries, beats, downbeats)

    # 6. Compute per-segment features (enriched)
    segments = _compute_segment_features(
        boundaries, duration, features, sr, hop_length
    )

    # 7. Classify segments
    sections = _classify_segments(segments, duration)

    return sections


# ─── Feature Extraction ────────────────────────────────────────────────

def _compute_features(
    y: np.ndarray,
    y_harmonic: np.ndarray,
    y_percussive: np.ndarray,
    sr: int,
    hop_length: int,
) -> dict:
    """Compute a rich set of audio features."""

    # MFCC (timbre) — from full mix
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, hop_length=hop_length)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(S), n_mfcc=13)

    # Chroma (harmony) — from harmonic component for cleaner pitch
    chroma = librosa.feature.chroma_cqt(
        y=y_harmonic, sr=sr, hop_length=hop_length, n_chroma=12
    )

    # Spectral contrast (timbre texture) — 7 bands
    contrast = librosa.feature.spectral_contrast(
        y=y, sr=sr, hop_length=hop_length, n_bands=6
    )

    # RMS energy — full, harmonic, percussive separately
    rms_full = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_harmonic = librosa.feature.rms(y=y_harmonic, hop_length=hop_length)[0]
    rms_percussive = librosa.feature.rms(y=y_percussive, hop_length=hop_length)[0]

    # Spectral centroid (brightness)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]

    # Onset strength (rhythmic activity)
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)

    # Band-specific energy (low / mid / high)
    S_power = np.abs(librosa.stft(y, hop_length=hop_length)) ** 2
    freqs = librosa.fft_frequencies(sr=sr)
    low_mask = freqs < 300          # bass + conga fundamentals
    mid_mask = (freqs >= 300) & (freqs < 2000)  # piano, guitar, vocals
    high_mask = freqs >= 2000       # brass, cymbals, hi-hat

    rms_low = np.sqrt(np.mean(S_power[low_mask, :], axis=0)) if np.any(low_mask) else rms_full
    rms_mid = np.sqrt(np.mean(S_power[mid_mask, :], axis=0)) if np.any(mid_mask) else rms_full
    rms_high = np.sqrt(np.mean(S_power[high_mask, :], axis=0)) if np.any(high_mask) else rms_full

    return {
        "mfcc": mfcc,
        "chroma": chroma,
        "contrast": contrast,
        "rms_full": rms_full,
        "rms_harmonic": rms_harmonic,
        "rms_percussive": rms_percussive,
        "rms_low": rms_low,
        "rms_mid": rms_mid,
        "rms_high": rms_high,
        "centroid": centroid,
        "onset_env": onset_env,
    }


# ─── Boundary Detection: Self-Similarity Matrix ────────────────────────

def _make_checkerboard_kernel(size: int) -> np.ndarray:
    """Create a checkerboard kernel for novelty detection on SSM."""
    kernel = np.ones((size, size))
    kernel[:size // 2, :size // 2] = -1
    kernel[size // 2:, size // 2:] = -1
    return kernel


def _find_boundaries_ssm(
    features: dict,
    duration: float,
    sr: int,
    hop_length: int,
) -> list[float]:
    """
    Find section boundaries using multi-feature self-similarity matrix
    with checkerboard kernel convolution.
    """
    # Combine features: MFCC + chroma + spectral contrast
    # Normalize each feature set before concatenating
    def _norm_features(F: np.ndarray) -> np.ndarray:
        mu = F.mean(axis=1, keepdims=True)
        std = F.std(axis=1, keepdims=True)
        std[std < 1e-8] = 1.0
        return (F - mu) / std

    mfcc_n = _norm_features(features["mfcc"])
    chroma_n = _norm_features(features["chroma"])
    contrast_n = _norm_features(features["contrast"])

    # Stack: 13 + 12 + 7 = 32 dimensional feature vector per frame
    combined = np.vstack([mfcc_n, chroma_n, contrast_n])

    # Downsample for efficiency (take every 4th frame → ~11.6 fps → ~86ms resolution)
    ds_factor = 4
    combined_ds = combined[:, ::ds_factor]
    n_frames = combined_ds.shape[1]

    if n_frames < 20:
        return []

    # Compute self-similarity matrix (cosine similarity)
    # Normalize columns to unit length
    norms = np.linalg.norm(combined_ds, axis=0, keepdims=True)
    norms[norms < 1e-8] = 1.0
    combined_unit = combined_ds / norms
    ssm = combined_unit.T @ combined_unit  # n_frames x n_frames

    # Apply median filter to clean up SSM
    ssm = median_filter(ssm, size=3)

    # Checkerboard kernel convolution along diagonal
    kernel_size = min(32, n_frames // 4)
    if kernel_size < 4:
        return []

    kernel = _make_checkerboard_kernel(kernel_size)
    half_k = kernel_size // 2

    novelty = np.zeros(n_frames)
    for i in range(half_k, n_frames - half_k):
        patch = ssm[i - half_k:i + half_k, i - half_k:i + half_k]
        if patch.shape == kernel.shape:
            novelty[i] = np.sum(patch * kernel)

    # Normalize novelty
    if np.max(novelty) > 0:
        novelty = novelty / np.max(novelty)

    # Peak picking on novelty curve
    # Adaptive threshold: mean + 0.5 * std
    threshold = np.mean(novelty) + 0.5 * np.std(novelty)
    threshold = max(threshold, 0.15)  # minimum threshold

    peaks = []
    for i in range(1, len(novelty) - 1):
        if novelty[i] > threshold and novelty[i] >= novelty[i - 1] and novelty[i] >= novelty[i + 1]:
            peaks.append(i)

    # Convert peak indices back to time
    boundary_times = []
    for p in peaks:
        frame_idx = p * ds_factor
        t = librosa.frames_to_time(frame_idx, sr=sr, hop_length=hop_length)
        if 3.0 < t < duration - 3.0:
            boundary_times.append(float(t))

    return sorted(boundary_times)


# ─── Boundary Detection: Agglomerative (fallback) ──────────────────────

def _find_boundaries_agglomerative(
    mfcc: np.ndarray,
    duration: float,
    sr: int,
) -> list[float]:
    """
    Original v1 agglomerative clustering approach as a supplementary source.
    """
    best_boundaries = []
    best_score = -1.0

    novelty = np.sqrt(np.sum(np.diff(mfcc, axis=1) ** 2, axis=0))

    for k in range(4, 9):
        try:
            bounds = librosa.segment.agglomerative(mfcc, k=k)
            bound_times = librosa.frames_to_time(bounds, sr=sr)

            score = 0.0
            for b in bounds:
                if 0 < b < len(novelty):
                    start = max(0, b - 2)
                    end = min(len(novelty), b + 3)
                    score += float(np.mean(novelty[start:end]))

            if score > best_score:
                best_score = score
                best_boundaries = bound_times.tolist()

        except Exception:
            continue

    return [b for b in best_boundaries if 3.0 < b < duration - 3.0]


# ─── Boundary Merging & Snapping ───────────────────────────────────────

def _merge_boundaries(
    ssm_bounds: list[float],
    agg_bounds: list[float],
    min_gap: float = 5.0,
) -> list[float]:
    """
    Merge SSM and agglomerative boundaries.
    If both methods agree (within 3 seconds), boost confidence.
    Keep all unique boundaries but remove those too close together.
    """
    all_bounds = sorted(ssm_bounds + agg_bounds)
    if not all_bounds:
        return []

    # Cluster nearby boundaries (within 3s → take average)
    merged = []
    cluster = [all_bounds[0]]

    for b in all_bounds[1:]:
        if b - cluster[-1] < 3.0:
            cluster.append(b)
        else:
            merged.append(float(np.mean(cluster)))
            cluster = [b]
    merged.append(float(np.mean(cluster)))

    # Remove boundaries too close together
    if len(merged) < 2:
        return merged

    filtered = [merged[0]]
    for b in merged[1:]:
        if b - filtered[-1] >= min_gap:
            filtered.append(b)

    return filtered


def _snap_to_phrases(
    boundaries: list[float],
    beats: list[float],
    downbeats: list[float] | None,
) -> list[float]:
    """
    Snap boundaries to nearest downbeat (phrase start) if available,
    otherwise to nearest beat.
    """
    # Prefer downbeats for phrase-level snapping
    snap_targets = downbeats if downbeats and len(downbeats) > 2 else beats
    if not snap_targets:
        return boundaries

    targets_arr = np.array(snap_targets)
    snapped = []
    for b in boundaries:
        idx = np.argmin(np.abs(targets_arr - b))
        snapped.append(float(targets_arr[idx]))

    return sorted(set(snapped))


# ─── Per-Segment Feature Computation ──────────────────────────────────

def _compute_segment_features(
    boundaries: list[float],
    duration: float,
    features: dict,
    sr: int,
    hop_length: int,
) -> list[dict]:
    """Compute enriched per-segment features including band energy and percussion ratio."""

    all_bounds = [0.0] + sorted(boundaries) + [duration]
    segments = []

    for i in range(len(all_bounds) - 1):
        start = all_bounds[i]
        end = all_bounds[i + 1]

        start_frame = int(start * sr / hop_length)
        end_frame = int(end * sr / hop_length)

        def _safe_mean(arr, sf, ef):
            sf = max(0, min(sf, len(arr) - 1))
            ef = max(sf + 1, min(ef, len(arr)))
            return float(np.mean(arr[sf:ef]))

        seg = {
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
            # Full mix energy
            "rms": _safe_mean(features["rms_full"], start_frame, end_frame),
            # Harmonic vs percussive
            "rms_harmonic": _safe_mean(features["rms_harmonic"], start_frame, end_frame),
            "rms_percussive": _safe_mean(features["rms_percussive"], start_frame, end_frame),
            # Band-specific energy
            "rms_low": _safe_mean(features["rms_low"], start_frame, end_frame),
            "rms_mid": _safe_mean(features["rms_mid"], start_frame, end_frame),
            "rms_high": _safe_mean(features["rms_high"], start_frame, end_frame),
            # Brightness & rhythm
            "centroid": _safe_mean(features["centroid"], start_frame, end_frame),
            "onset_density": _safe_mean(features["onset_env"], start_frame, end_frame),
        }

        # Derived ratios
        total_hp = seg["rms_harmonic"] + seg["rms_percussive"]
        seg["percussion_ratio"] = seg["rms_percussive"] / total_hp if total_hp > 1e-8 else 0.0
        seg["harmonic_ratio"] = seg["rms_harmonic"] / total_hp if total_hp > 1e-8 else 0.0

        total_band = seg["rms_low"] + seg["rms_mid"] + seg["rms_high"]
        seg["low_ratio"] = seg["rms_low"] / total_band if total_band > 1e-8 else 0.33
        seg["high_ratio"] = seg["rms_high"] / total_band if total_band > 1e-8 else 0.33

        segments.append(seg)

    return segments


# ─── Classification ───────────────────────────────────────────────────

def _classify_segments(segments: list[dict], duration: float) -> list[SectionInfo]:
    """
    Classify segments into Latin dance sections using enriched features.

    Key insights for Latin dance music:
    - Intro: low percussion, often harmonic-only (guitar/piano solo)
    - Derecho: balanced energy, moderate percussion (conga enters)
    - Majao: syncopated feel, high onset density, moderate brightness
    - Mambo: highest energy, high-frequency content (brass), high percussion
    - Bridge: low energy dip between louder sections
    - Outro: declining energy, often mirrors intro
    """
    if not segments:
        return []

    n = len(segments)

    # Normalize all features to [0, 1] within track
    feature_keys = ["rms", "centroid", "onset_density", "rms_percussive",
                    "rms_harmonic", "rms_low", "rms_mid", "rms_high"]

    normed = {}
    for key in feature_keys:
        values = [s[key] for s in segments]
        vmin, vmax = min(values), max(values)
        rng = vmax - vmin if vmax - vmin > 1e-8 else 1.0
        normed[key] = [(v - vmin) / rng for v in values]

    # Add normalized values to segments
    for i, s in enumerate(segments):
        for key in feature_keys:
            s[f"{key}_n"] = normed[key][i]

    # Score each segment for each label
    scores = []
    for i, s in enumerate(segments):
        seg_scores = {}

        # ── Intro score ──
        # Low percussion + low overall energy + early position
        position_factor = 1.0 - (s["start"] / duration)  # higher for early segments
        intro_score = (
            (1.0 - s["rms_percussive_n"]) * 0.35 +
            (1.0 - s["rms_n"]) * 0.25 +
            s["harmonic_ratio"] * 0.2 +
            position_factor * 0.2
        )
        # Penalize if not first/second segment
        if i > 1:
            intro_score *= 0.3
        seg_scores["intro"] = intro_score

        # ── Outro score ──
        # Low/declining energy + late position
        late_factor = s["start"] / duration  # higher for late segments
        outro_score = (
            (1.0 - s["rms_n"]) * 0.3 +
            late_factor * 0.3 +
            (1.0 - s["rms_percussive_n"]) * 0.2 +
            s["harmonic_ratio"] * 0.2
        )
        # Penalize if not last/second-to-last segment
        if i < n - 2:
            outro_score *= 0.3
        seg_scores["outro"] = outro_score

        # ── Mambo score ──
        # Highest energy + high brightness + high percussion + brass (high freq)
        mambo_score = (
            s["rms_n"] * 0.25 +
            s["centroid_n"] * 0.2 +
            s["rms_high_n"] * 0.2 +
            s["rms_percussive_n"] * 0.2 +
            s["onset_density_n"] * 0.15
        )
        # Penalize first/last segments
        if i == 0 or i == n - 1:
            mambo_score *= 0.4
        seg_scores["mambo"] = mambo_score

        # ── Majao score ──
        # High onset density + moderate energy + lower brightness than mambo
        majao_score = (
            s["onset_density_n"] * 0.3 +
            s["rms_percussive_n"] * 0.25 +
            s["rms_n"] * 0.2 +
            (1.0 - s["rms_high_n"]) * 0.15 +  # less bright than mambo
            s["rms_low_n"] * 0.1              # strong bass
        )
        if i == 0 or i == n - 1:
            majao_score *= 0.5
        seg_scores["majao"] = majao_score

        # ── Bridge score ──
        # Short + low energy + between louder sections
        short_factor = max(0, 1.0 - s["duration"] / 20.0)  # shorter = higher
        bridge_score = (
            (1.0 - s["rms_n"]) * 0.35 +
            short_factor * 0.35 +
            (1.0 - s["onset_density_n"]) * 0.15 +
            s["harmonic_ratio"] * 0.15
        )
        if i == 0 or i == n - 1:
            bridge_score *= 0.3
        # Must be between louder sections
        if i > 0 and i < n - 1:
            prev_louder = segments[i - 1]["rms"] > s["rms"]
            next_louder = segments[i + 1]["rms"] > s["rms"]
            if prev_louder and next_louder:
                bridge_score *= 1.3
        seg_scores["bridge"] = bridge_score

        # ── Derecho score ──
        # Balanced, moderate energy — the "default" dance section
        derecho_score = (
            s["rms_n"] * 0.2 +
            s["percussion_ratio"] * 0.2 +
            (1.0 - abs(s["rms_n"] - 0.5)) * 0.2 +  # prefer mid-range energy
            s["onset_density_n"] * 0.15 +
            (s["duration"] / duration) * 0.15 +      # longer = more likely derecho
            0.1                                       # slight bias (most common section)
        )
        seg_scores["derecho"] = derecho_score

        scores.append(seg_scores)

    # ── Assignment pass ──
    # First pass: assign each segment to its highest-scoring label
    labels = []
    confidences = []
    for i, seg_scores in enumerate(scores):
        best_label = max(seg_scores, key=seg_scores.get)
        best_score = seg_scores[best_label]
        labels.append(best_label)
        confidences.append(best_score)

    # ── Constraint pass ──
    # Rule: intro must come before derecho, outro must be last
    # Rule: mambo should appear in the middle-to-late portion

    # If no intro was detected but first segment has weak percussion → force intro
    if labels[0] != "intro" and segments[0]["percussion_ratio"] < 0.35:
        labels[0] = "intro"
        confidences[0] = 0.6

    # Ensure at most one intro (the earliest one)
    intro_found = False
    for i in range(n):
        if labels[i] == "intro":
            if intro_found:
                labels[i] = "derecho"
                confidences[i] = 0.4
            intro_found = True

    # Ensure at most one outro (the latest one)
    outro_indices = [i for i in range(n) if labels[i] == "outro"]
    if len(outro_indices) > 1:
        for idx in outro_indices[:-1]:
            labels[idx] = "derecho"
            confidences[idx] = 0.4

    # Ensure at most one mambo (the highest-scoring one)
    mambo_indices = [i for i in range(n) if labels[i] == "mambo"]
    if len(mambo_indices) > 1:
        best_mambo = max(mambo_indices, key=lambda i: scores[i]["mambo"])
        for idx in mambo_indices:
            if idx != best_mambo:
                labels[idx] = "derecho"
                confidences[idx] = 0.4

    # Build result
    sections = []
    for i, s in enumerate(segments):
        conf = min(1.0, max(0.1, confidences[i]))
        sections.append(SectionInfo(
            label=labels[i],
            start_time=s["start"],
            end_time=s["end"],
            confidence=round(conf, 2),
        ))

    return sections
