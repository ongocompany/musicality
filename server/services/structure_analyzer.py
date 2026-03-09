"""
Music structure analyzer for Latin dance music (v2.1).
Detects sections: intro, derecho, majao, mambo, bridge, outro.

v2.1 improvements over v2:
- Beat-synchronous features (all features averaged per beat interval)
  → cleaner SSM, better boundary detection for syncopated Latin music
- Tempogram added for rhythm pattern change detection
- SSM computed on beat-level data (no arbitrary downsampling)
- Faster processing (fewer data points: ~400 beats vs ~10000 frames)

v2 features retained:
- Multi-feature self-similarity matrix (MFCC + chroma + spectral contrast)
- Checkerboard kernel convolution for boundary detection
- Harmonic-percussive source separation (percussion entry = derecho start)
- Band-specific energy analysis (low/mid/high frequency)
- Phrase-aligned boundary snapping (4-bar phrases via downbeats)
- Score-based classification for Latin music sections

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
    if len(beats) < 8:
        return [SectionInfo(
            label="derecho",
            start_time=0.0,
            end_time=round(duration, 3),
            confidence=0.3,
        )]

    # 1. Load audio
    y, sr = librosa.load(audio_path, sr=22050)
    hop_length = 512

    # 2. Harmonic-Percussive Source Separation
    y_harmonic, y_percussive = librosa.effects.hpss(y)

    # 3. Compute beat-synchronous features
    beat_times = np.array(beats)
    features = _compute_features(
        y, y_harmonic, y_percussive, sr, hop_length, beat_times
    )

    # 4. Find boundaries via beat-sync SSM + checkerboard kernel
    boundaries = _find_boundaries_ssm(features, beat_times)

    # Also get agglomerative boundaries as fallback/supplement
    agg_boundaries = _find_boundaries_agglomerative(
        features["mfcc_sync"], beat_times
    )

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

    # 6. Compute per-segment features (from beat-sync data)
    segments = _compute_segment_features(
        boundaries, duration, features, beat_times
    )

    # 7. Classify segments
    sections = _classify_segments(segments, duration)

    return sections


def analyze_structure_with_phrases(
    audio_path: str,
    duration: float,
    beats: list[float],
    downbeats: list[float] | None = None,
) -> tuple[list[SectionInfo], list[float]]:
    """
    Same as analyze_structure but also returns phrase boundary timestamps.

    The SSM + agglomerative boundaries represent natural musical phrase changes.
    We return them as phrase_boundaries for the client to build phrase segments.

    Returns:
        (sections, phrase_boundaries) where phrase_boundaries are sorted
        timestamps in seconds, snapped to downbeats/beats.
    """
    if len(beats) < 8:
        return (
            [SectionInfo(
                label="derecho",
                start_time=0.0,
                end_time=round(duration, 3),
                confidence=0.3,
            )],
            [],
        )

    # 1. Load audio
    y, sr = librosa.load(audio_path, sr=22050)
    hop_length = 512

    # 2. Harmonic-Percussive Source Separation
    y_harmonic, y_percussive = librosa.effects.hpss(y)

    # 3. Compute beat-synchronous features
    beat_times = np.array(beats)
    features = _compute_features(
        y, y_harmonic, y_percussive, sr, hop_length, beat_times
    )

    # 4. Find boundaries via beat-sync SSM + checkerboard kernel
    boundaries = _find_boundaries_ssm(features, beat_times)

    # Also get agglomerative boundaries as fallback/supplement
    agg_boundaries = _find_boundaries_agglomerative(
        features["mfcc_sync"], beat_times
    )

    # Merge both boundary sets
    boundaries = _merge_boundaries(boundaries, agg_boundaries, min_gap=5.0)

    if len(boundaries) < 1:
        return (
            [SectionInfo(
                label="derecho",
                start_time=0.0,
                end_time=round(duration, 3),
                confidence=0.3,
            )],
            [],
        )

    # 5. Snap boundaries to downbeats (phrase-aligned) or beats
    boundaries = _snap_to_phrases(boundaries, beats, downbeats)

    # ── Phrase boundaries = snapped boundaries (the core output) ──
    phrase_boundaries = [round(b, 3) for b in boundaries]

    # 6. Compute per-segment features (from beat-sync data)
    segments = _compute_segment_features(
        boundaries, duration, features, beat_times
    )

    # 7. Classify segments
    sections = _classify_segments(segments, duration)

    return sections, phrase_boundaries


# ─── Feature Extraction (Beat-Synchronous) ─────────────────────────────

def _compute_features(
    y: np.ndarray,
    y_harmonic: np.ndarray,
    y_percussive: np.ndarray,
    sr: int,
    hop_length: int,
    beat_times: np.ndarray,
) -> dict:
    """
    Compute audio features and sync them to beat positions.

    Instead of frame-level features (~10000 frames for a 4-min track),
    we average each feature within beat intervals (~400 beats).
    This removes syncopation noise and makes boundaries much cleaner.
    """
    # Convert beat times to frame indices for sync
    beat_frames = librosa.time_to_frames(beat_times, sr=sr, hop_length=hop_length)

    # ── Frame-level features ──

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

    # Tempogram (rhythm pattern) — new in v2.1
    tempogram = librosa.feature.tempogram(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length
    )

    # Band-specific energy (low / mid / high)
    S_power = np.abs(librosa.stft(y, hop_length=hop_length)) ** 2
    freqs = librosa.fft_frequencies(sr=sr)
    low_mask = freqs < 300           # bass + conga fundamentals
    mid_mask = (freqs >= 300) & (freqs < 2000)  # piano, guitar, vocals
    high_mask = freqs >= 2000        # brass, cymbals, hi-hat

    rms_low = np.sqrt(np.mean(S_power[low_mask, :], axis=0)) if np.any(low_mask) else rms_full
    rms_mid = np.sqrt(np.mean(S_power[mid_mask, :], axis=0)) if np.any(mid_mask) else rms_full
    rms_high = np.sqrt(np.mean(S_power[high_mask, :], axis=0)) if np.any(high_mask) else rms_full

    # ── Beat-synchronous aggregation ──
    # librosa.util.sync averages each feature within beat intervals
    # Result: (n_features, n_beats) instead of (n_features, n_frames)

    mfcc_sync = librosa.util.sync(mfcc, beat_frames, aggregate=np.mean)
    chroma_sync = librosa.util.sync(chroma, beat_frames, aggregate=np.mean)
    contrast_sync = librosa.util.sync(contrast, beat_frames, aggregate=np.mean)
    tempogram_sync = librosa.util.sync(tempogram, beat_frames, aggregate=np.mean)

    # 1D features → expand to 2D for sync, then squeeze back
    def _sync_1d(arr):
        return librosa.util.sync(
            arr.reshape(1, -1), beat_frames, aggregate=np.mean
        )[0]

    rms_full_sync = _sync_1d(rms_full)
    rms_harmonic_sync = _sync_1d(rms_harmonic)
    rms_percussive_sync = _sync_1d(rms_percussive)
    rms_low_sync = _sync_1d(rms_low)
    rms_mid_sync = _sync_1d(rms_mid)
    rms_high_sync = _sync_1d(rms_high)
    centroid_sync = _sync_1d(centroid)
    onset_sync = _sync_1d(onset_env)

    return {
        # Beat-synced 2D features (for SSM)
        "mfcc_sync": mfcc_sync,
        "chroma_sync": chroma_sync,
        "contrast_sync": contrast_sync,
        "tempogram_sync": tempogram_sync,
        # Beat-synced 1D features (for segment classification)
        "rms_full": rms_full_sync,
        "rms_harmonic": rms_harmonic_sync,
        "rms_percussive": rms_percussive_sync,
        "rms_low": rms_low_sync,
        "rms_mid": rms_mid_sync,
        "rms_high": rms_high_sync,
        "centroid": centroid_sync,
        "onset_env": onset_sync,
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
    beat_times: np.ndarray,
) -> list[float]:
    """
    Find section boundaries using beat-synchronous SSM
    with checkerboard kernel convolution.

    Since features are already beat-synced, each column = 1 beat.
    No downsampling needed — data is already compact (~400 beats).
    Peak indices map directly to beat timestamps.
    """
    def _norm(F: np.ndarray) -> np.ndarray:
        mu = F.mean(axis=1, keepdims=True)
        std = F.std(axis=1, keepdims=True)
        std[std < 1e-8] = 1.0
        return (F - mu) / std

    # Combine beat-synced features: MFCC(13) + Chroma(12) + Contrast(7) + Tempogram(top 8)
    mfcc_n = _norm(features["mfcc_sync"])
    chroma_n = _norm(features["chroma_sync"])
    contrast_n = _norm(features["contrast_sync"])

    # Tempogram: use only top 8 tempo bands (most informative)
    tempo_full = features["tempogram_sync"]
    n_tempo_bins = min(8, tempo_full.shape[0])
    # Select bins with highest variance (most discriminative)
    variances = np.var(tempo_full, axis=1)
    top_bins = np.argsort(variances)[-n_tempo_bins:]
    tempogram_n = _norm(tempo_full[top_bins, :])

    # Stack: 13 + 12 + 7 + 8 = 40 dimensional feature vector per beat
    combined = np.vstack([mfcc_n, chroma_n, contrast_n, tempogram_n])
    n_beats = combined.shape[1]

    if n_beats < 16:
        return []

    # Compute self-similarity matrix (cosine similarity)
    norms = np.linalg.norm(combined, axis=0, keepdims=True)
    norms[norms < 1e-8] = 1.0
    combined_unit = combined / norms
    ssm = combined_unit.T @ combined_unit  # n_beats x n_beats

    # Apply median filter to clean up SSM
    ssm = median_filter(ssm, size=3)

    # Checkerboard kernel convolution along diagonal
    # Kernel size in beats: ~16 beats = 4 bars (at 4/4 time)
    kernel_size = min(16, n_beats // 4)
    if kernel_size < 4:
        kernel_size = 4

    # Make kernel size even
    kernel_size = kernel_size - (kernel_size % 2)

    kernel = _make_checkerboard_kernel(kernel_size)
    half_k = kernel_size // 2

    novelty = np.zeros(n_beats)
    for i in range(half_k, n_beats - half_k):
        patch = ssm[i - half_k:i + half_k, i - half_k:i + half_k]
        if patch.shape == kernel.shape:
            novelty[i] = np.sum(patch * kernel)

    # Normalize novelty
    if np.max(novelty) > 0:
        novelty = novelty / np.max(novelty)

    # Peak picking with adaptive threshold
    threshold = np.mean(novelty) + 0.5 * np.std(novelty)
    threshold = max(threshold, 0.15)

    # Minimum distance between peaks: 8 beats (~2 bars)
    min_dist = 8
    peaks = []
    for i in range(1, len(novelty) - 1):
        if novelty[i] > threshold and novelty[i] >= novelty[i - 1] and novelty[i] >= novelty[i + 1]:
            if not peaks or (i - peaks[-1]) >= min_dist:
                peaks.append(i)

    # Convert beat indices to time
    duration = float(beat_times[-1]) + 1.0  # approximate end
    boundary_times = []
    for p in peaks:
        if p < len(beat_times):
            t = float(beat_times[p])
            if 3.0 < t < duration - 3.0:
                boundary_times.append(t)

    return sorted(boundary_times)


# ─── Boundary Detection: Agglomerative (fallback) ──────────────────────

def _find_boundaries_agglomerative(
    mfcc_sync: np.ndarray,
    beat_times: np.ndarray,
) -> list[float]:
    """
    Agglomerative clustering on beat-synced MFCCs as supplementary source.
    """
    n_beats = mfcc_sync.shape[1]
    if n_beats < 8:
        return []

    duration = float(beat_times[-1]) + 1.0

    best_boundaries = []
    best_score = -1.0

    novelty = np.sqrt(np.sum(np.diff(mfcc_sync, axis=1) ** 2, axis=0))

    for k in range(4, 9):
        try:
            bounds = librosa.segment.agglomerative(mfcc_sync, k=k)

            score = 0.0
            for b in bounds:
                if 0 < b < len(novelty):
                    start = max(0, b - 1)
                    end = min(len(novelty), b + 2)
                    score += float(np.mean(novelty[start:end]))

            if score > best_score:
                best_score = score
                # Convert beat indices to times
                best_boundaries = [
                    float(beat_times[b]) for b in bounds
                    if b < len(beat_times)
                ]

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
    Boundaries agreed by both methods (within 3s) are stronger.
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
    beat_times: np.ndarray,
) -> list[dict]:
    """
    Compute per-segment features using beat-synced data.
    Uses beat indices instead of frame indices for precise alignment.
    """
    all_bounds = [0.0] + sorted(boundaries) + [duration]
    segments = []

    for i in range(len(all_bounds) - 1):
        start = all_bounds[i]
        end = all_bounds[i + 1]

        # Find beat range for this segment
        start_beat = int(np.searchsorted(beat_times, start))
        end_beat = int(np.searchsorted(beat_times, end))

        def _safe_mean(arr, sb, eb):
            sb = max(0, min(sb, len(arr) - 1))
            eb = max(sb + 1, min(eb, len(arr)))
            return float(np.mean(arr[sb:eb]))

        seg = {
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
            # Full mix energy
            "rms": _safe_mean(features["rms_full"], start_beat, end_beat),
            # Harmonic vs percussive
            "rms_harmonic": _safe_mean(features["rms_harmonic"], start_beat, end_beat),
            "rms_percussive": _safe_mean(features["rms_percussive"], start_beat, end_beat),
            # Band-specific energy
            "rms_low": _safe_mean(features["rms_low"], start_beat, end_beat),
            "rms_mid": _safe_mean(features["rms_mid"], start_beat, end_beat),
            "rms_high": _safe_mean(features["rms_high"], start_beat, end_beat),
            # Brightness & rhythm
            "centroid": _safe_mean(features["centroid"], start_beat, end_beat),
            "onset_density": _safe_mean(features["onset_env"], start_beat, end_beat),
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
        position_factor = 1.0 - (s["start"] / duration)
        intro_score = (
            (1.0 - s["rms_percussive_n"]) * 0.35 +
            (1.0 - s["rms_n"]) * 0.25 +
            s["harmonic_ratio"] * 0.2 +
            position_factor * 0.2
        )
        if i > 1:
            intro_score *= 0.3
        seg_scores["intro"] = intro_score

        # ── Outro score ──
        late_factor = s["start"] / duration
        outro_score = (
            (1.0 - s["rms_n"]) * 0.3 +
            late_factor * 0.3 +
            (1.0 - s["rms_percussive_n"]) * 0.2 +
            s["harmonic_ratio"] * 0.2
        )
        if i < n - 2:
            outro_score *= 0.3
        seg_scores["outro"] = outro_score

        # ── Mambo score ──
        # Mambo = SHORT high-energy peak (brass solo), NOT the main body
        mambo_score = (
            s["rms_n"] * 0.25 +
            s["centroid_n"] * 0.2 +
            s["rms_high_n"] * 0.2 +
            s["rms_percussive_n"] * 0.2 +
            s["onset_density_n"] * 0.15
        )
        if i == 0 or i == n - 1:
            mambo_score *= 0.4
        # Duration penalty: mambo is typically 15-40s, NOT the longest section
        seg_ratio = s["duration"] / duration
        if seg_ratio > 0.25:
            mambo_score *= 0.3  # heavy penalty for long segments
        elif seg_ratio > 0.15:
            mambo_score *= 0.7  # moderate penalty
        seg_scores["mambo"] = mambo_score

        # ── Majao score ──
        majao_score = (
            s["onset_density_n"] * 0.3 +
            s["rms_percussive_n"] * 0.25 +
            s["rms_n"] * 0.2 +
            (1.0 - s["rms_high_n"]) * 0.15 +
            s["rms_low_n"] * 0.1
        )
        if i == 0 or i == n - 1:
            majao_score *= 0.5
        seg_scores["majao"] = majao_score

        # ── Bridge score ──
        short_factor = max(0, 1.0 - s["duration"] / 20.0)
        bridge_score = (
            (1.0 - s["rms_n"]) * 0.35 +
            short_factor * 0.35 +
            (1.0 - s["onset_density_n"]) * 0.15 +
            s["harmonic_ratio"] * 0.15
        )
        if i == 0 or i == n - 1:
            bridge_score *= 0.3
        if i > 0 and i < n - 1:
            prev_louder = segments[i - 1]["rms"] > s["rms"]
            next_louder = segments[i + 1]["rms"] > s["rms"]
            if prev_louder and next_louder:
                bridge_score *= 1.3
        seg_scores["bridge"] = bridge_score

        # ── Derecho score ──
        derecho_score = (
            s["rms_n"] * 0.2 +
            s["percussion_ratio"] * 0.2 +
            (1.0 - abs(s["rms_n"] - 0.5)) * 0.2 +
            s["onset_density_n"] * 0.15 +
            (s["duration"] / duration) * 0.15 +
            0.1
        )
        seg_scores["derecho"] = derecho_score

        scores.append(seg_scores)

    # ── Assignment pass ──
    labels = []
    confidences = []
    for i, seg_scores in enumerate(scores):
        best_label = max(seg_scores, key=seg_scores.get)
        best_score = seg_scores[best_label]
        labels.append(best_label)
        confidences.append(best_score)

    # ── Constraint pass ──

    # 1. Intro: first segment with weak percussion → force intro
    if labels[0] != "intro" and segments[0]["percussion_ratio"] < 0.35:
        labels[0] = "intro"
        confidences[0] = 0.6

    # 2. At most one intro (earliest only)
    intro_found = False
    for i in range(n):
        if labels[i] == "intro":
            if intro_found:
                labels[i] = "derecho"
                confidences[i] = 0.4
            intro_found = True

    # 3. At most one outro (latest only)
    outro_indices = [i for i in range(n) if labels[i] == "outro"]
    if len(outro_indices) > 1:
        for idx in outro_indices[:-1]:
            labels[idx] = "derecho"
            confidences[idx] = 0.4

    # 4. At most one mambo (highest-scoring)
    mambo_indices = [i for i in range(n) if labels[i] == "mambo"]
    if len(mambo_indices) > 1:
        best_mambo = max(mambo_indices, key=lambda i: scores[i]["mambo"])
        for idx in mambo_indices:
            if idx != best_mambo:
                labels[idx] = "derecho"
                confidences[idx] = 0.4

    # 5. Mambo can't be the longest section — longest = derecho (main body)
    mambo_indices = [i for i in range(n) if labels[i] == "mambo"]
    if mambo_indices:
        longest_idx = max(range(n), key=lambda i: segments[i]["duration"])
        for idx in mambo_indices:
            if idx == longest_idx:
                labels[idx] = "derecho"
                confidences[idx] = 0.5

    # 6. Ensure the longest non-intro/outro section is derecho
    #    (bachata main body = derecho, not majao or mambo)
    middle_indices = [i for i in range(n) if labels[i] not in ("intro", "outro")]
    if middle_indices:
        longest_mid = max(middle_indices, key=lambda i: segments[i]["duration"])
        if labels[longest_mid] != "derecho" and segments[longest_mid]["duration"] / duration > 0.3:
            labels[longest_mid] = "derecho"
            confidences[longest_mid] = 0.6

    # 7. Short segment merge (ONLY for middle segments, preserve intro/outro)
    MIN_SECTION_DURATION = 10.0
    merged_segments = []
    merged_labels = []
    merged_confidences = []

    for i in range(n):
        seg = segments[i]
        is_short = seg["duration"] < MIN_SECTION_DURATION

        # Never merge intro (first) or outro (last) — they can be short
        is_intro = (i == 0 and labels[i] == "intro")
        is_outro = (i == n - 1 and labels[i] == "outro")

        if is_short and not is_intro and not is_outro and n > 3:
            # Middle short segment → merge into previous
            if merged_segments:
                merged_segments[-1]["end"] = seg["end"]
                merged_segments[-1]["duration"] = round(
                    merged_segments[-1]["end"] - merged_segments[-1]["start"], 3
                )
            continue
        else:
            merged_segments.append(dict(seg))
            merged_labels.append(labels[i])
            merged_confidences.append(confidences[i])

    # Use merged data if valid
    if len(merged_segments) >= 2:
        segments = merged_segments
        labels = merged_labels
        confidences = merged_confidences
        n = len(segments)

    # 8. Final outro enforcement
    #    Last segment with declining energy → outro
    if n >= 2 and labels[-1] != "outro":
        if segments[-1]["rms"] < segments[-2]["rms"] * 0.85:
            labels[-1] = "outro"
            confidences[-1] = 0.7

    #    If no outro exists but last segment is short → mark as outro
    if not any(l == "outro" for l in labels):
        if segments[-1]["duration"] < 15.0:
            labels[-1] = "outro"
            confidences[-1] = 0.6

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
