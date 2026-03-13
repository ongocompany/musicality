"""
Formation pattern library and rule engine for Latin dance.

Generates formation suggestions based on music analysis (sections, phrases, beats).
Uses deterministic rules — no LLM calls.

Patterns:
  pairs-facing, pairs-side, line, circle, v-shape,
  diamond, two-lines, staggered, scatter
"""

from __future__ import annotations

import math
from typing import Any


# ─── Pattern generators ──────────────────────────────
# Each takes dancer count (n) and returns list of (x, y) normalized 0-1.
# Stage convention: x = left-right, y = back(0)-front(1), audience at y=1.

def _pairs_facing(n: int) -> list[tuple[float, float]]:
    """Leaders and followers face each other in pairs."""
    pairs = n // 2
    remainder = n % 2
    positions: list[tuple[float, float]] = []
    for i in range(pairs):
        x = 0.3 + 0.4 * i / max(1, pairs - 1) if pairs > 1 else 0.5
        positions.append((x, 0.35))  # leader (back)
        positions.append((x, 0.65))  # follower (front)
    if remainder:
        positions.append((0.5, 0.5))
    return positions[:n]


def _pairs_side(n: int) -> list[tuple[float, float]]:
    """Leaders and followers side by side."""
    pairs = n // 2
    remainder = n % 2
    positions: list[tuple[float, float]] = []
    for i in range(pairs):
        x = 0.15 + 0.7 * i / max(1, pairs - 1) if pairs > 1 else 0.5
        positions.append((x, 0.48))
        positions.append((x + 0.05, 0.52))
    if remainder:
        positions.append((0.5, 0.5))
    return positions[:n]


def _line(n: int) -> list[tuple[float, float]]:
    """Single horizontal line across the stage."""
    return [
        (0.1 + 0.8 * i / max(1, n - 1) if n > 1 else 0.5, 0.5)
        for i in range(n)
    ]


def _circle(n: int) -> list[tuple[float, float]]:
    """Circle formation centered on stage."""
    return [
        (0.5 + 0.28 * math.cos(2 * math.pi * i / n),
         0.5 + 0.28 * math.sin(2 * math.pi * i / n))
        for i in range(n)
    ]


def _v_shape(n: int) -> list[tuple[float, float]]:
    """V-shape pointing toward audience."""
    positions: list[tuple[float, float]] = []
    for i in range(n):
        side = i % 2  # alternate left/right
        depth = i // 2
        max_depth = max(1, (n - 1) // 2)
        x_offset = 0.15 + 0.2 * depth / max_depth
        y_pos = 0.3 + 0.4 * depth / max_depth
        x = 0.5 - x_offset if side == 0 else 0.5 + x_offset
        positions.append((x, y_pos))
    return positions[:n]


def _diamond(n: int) -> list[tuple[float, float]]:
    """Diamond / rhombus formation."""
    if n <= 2:
        return [(0.5, 0.35), (0.5, 0.65)][:n]
    if n <= 4:
        return [(0.5, 0.25), (0.3, 0.5), (0.7, 0.5), (0.5, 0.75)][:n]
    positions: list[tuple[float, float]] = [
        (0.5, 0.2),   # top
        (0.5, 0.8),   # bottom
        (0.2, 0.5),   # left
        (0.8, 0.5),   # right
    ]
    for i in range(4, n):
        angle = math.pi / 4 + (2 * math.pi * (i - 4)) / max(1, n - 4)
        positions.append((0.5 + 0.22 * math.cos(angle),
                          0.5 + 0.22 * math.sin(angle)))
    return positions[:n]


def _two_lines(n: int) -> list[tuple[float, float]]:
    """Two horizontal lines (front and back)."""
    front = n // 2
    back = n - front
    positions: list[tuple[float, float]] = []
    for i in range(back):
        x = 0.15 + 0.7 * i / max(1, back - 1) if back > 1 else 0.5
        positions.append((x, 0.35))
    for i in range(front):
        x = 0.15 + 0.7 * i / max(1, front - 1) if front > 1 else 0.5
        positions.append((x, 0.65))
    return positions[:n]


def _staggered(n: int) -> list[tuple[float, float]]:
    """Staggered / checkerboard layout."""
    positions: list[tuple[float, float]] = []
    cols = min(n, 4)
    rows = math.ceil(n / cols)
    for r in range(rows):
        y = 0.2 + 0.6 * r / max(1, rows - 1) if rows > 1 else 0.5
        row_count = min(cols, n - r * cols)
        x_offset = 0.05 if r % 2 == 1 else 0.0
        for c in range(row_count):
            x = 0.15 + x_offset + 0.7 * c / max(1, cols - 1) if cols > 1 else 0.5
            positions.append((min(0.95, max(0.05, x)), y))
    return positions[:n]


def _scatter(n: int) -> list[tuple[float, float]]:
    """Spread out across stage (deterministic pseudo-scatter)."""
    # Use golden ratio for even distribution
    phi = (1 + math.sqrt(5)) / 2
    positions: list[tuple[float, float]] = []
    for i in range(n):
        x = 0.15 + 0.7 * ((i * phi) % 1)
        y = 0.15 + 0.7 * ((i * phi * phi) % 1)
        positions.append((x, y))
    return positions[:n]


# ─── Pattern registry ────────────────────────────────

PATTERNS: dict[str, Any] = {
    "pairs-facing": _pairs_facing,
    "pairs-side": _pairs_side,
    "line": _line,
    "circle": _circle,
    "v-shape": _v_shape,
    "diamond": _diamond,
    "two-lines": _two_lines,
    "staggered": _staggered,
    "scatter": _scatter,
}

# ─── Section-to-pattern mapping rules ────────────────
# Each section type maps to a list of patterns (cycled for variety).

SECTION_RULES: dict[str, list[str]] = {
    "intro": ["scatter", "pairs-facing"],
    "derecho": ["pairs-facing", "two-lines", "pairs-side"],
    "majao": ["circle", "v-shape", "staggered"],
    "mambo": ["line", "v-shape", "diamond"],
    "bridge": ["scatter", "pairs-facing"],
    "outro": ["circle", "pairs-facing"],
}

# Default pattern order when no sections are available
DEFAULT_PATTERN_CYCLE = [
    "pairs-facing", "line", "circle", "v-shape",
    "two-lines", "diamond", "staggered",
]


def _find_beat_index(beats: list[float], time_sec: float) -> int:
    """Find the nearest beat index for a given timestamp."""
    if not beats:
        return 0
    best_idx = 0
    best_dist = abs(beats[0] - time_sec)
    for i, bt in enumerate(beats):
        dist = abs(bt - time_sec)
        if dist < best_dist:
            best_dist = dist
            best_idx = i
    return best_idx


def suggest_formations(
    dancer_count: int,
    dance_style: str,
    beats: list[float],
    bpm: float,
    sections: list[dict] | None = None,
    phrase_boundaries: list[float] | None = None,
) -> dict:
    """
    Generate formation suggestions based on music analysis.

    Args:
        dancer_count: Number of dancers (2-12)
        dance_style: 'bachata', 'salsa-on1', 'salsa-on2'
        beats: Beat timestamps in seconds
        bpm: Beats per minute
        sections: Section analysis results (optional)
        phrase_boundaries: Phrase boundary timestamps in seconds (optional)

    Returns:
        FormationData dict with dancers and keyframes
    """
    dancer_count = max(2, min(12, dancer_count))

    # Build dancer definitions
    leader_colors = ["#4488FF", "#2196F3", "#1565C0", "#0D47A1", "#42A5F5", "#1E88E5"]
    follower_colors = ["#FF6B9D", "#E91E63", "#C2185B", "#AD1457", "#F06292", "#EC407A"]

    dancers = []
    pairs = math.ceil(dancer_count / 2)
    for i in range(pairs):
        dancers.append({
            "id": f"L{i + 1}",
            "label": f"Leader {i + 1}",
            "role": "leader",
            "color": leader_colors[i % len(leader_colors)],
        })
        if len(dancers) < dancer_count:
            dancers.append({
                "id": f"F{i + 1}",
                "label": f"Follower {i + 1}",
                "role": "follower",
                "color": follower_colors[i % len(follower_colors)],
            })
    dancers = dancers[:dancer_count]

    # Determine keyframe beat indices from phrase boundaries
    keyframe_beat_indices: list[int] = []

    if phrase_boundaries and len(phrase_boundaries) > 0:
        # Use phrase boundaries as keyframe positions
        keyframe_beat_indices.append(0)  # always start at beat 0
        for boundary_sec in phrase_boundaries:
            bi = _find_beat_index(beats, boundary_sec)
            if bi > 0 and bi not in keyframe_beat_indices:
                keyframe_beat_indices.append(bi)
    elif len(beats) >= 32:
        # Fallback: place keyframes every 32 beats (4 eight-counts)
        for i in range(0, len(beats), 32):
            keyframe_beat_indices.append(i)
    else:
        keyframe_beat_indices = [0]

    keyframe_beat_indices.sort()

    # Assign patterns to keyframes based on sections
    keyframes: list[dict] = []
    section_pattern_counters: dict[str, int] = {}

    for kf_idx, beat_idx in enumerate(keyframe_beat_indices):
        beat_time = beats[beat_idx] if beat_idx < len(beats) else 0.0

        # Find which section this beat belongs to
        section_label = "derecho"  # default
        if sections:
            for sec in sections:
                if sec.get("start_time", 0) <= beat_time < sec.get("end_time", 999999):
                    section_label = sec.get("label", "derecho")
                    break

        # Get pattern for this section (cycle through options)
        pattern_list = SECTION_RULES.get(section_label, DEFAULT_PATTERN_CYCLE)
        counter = section_pattern_counters.get(section_label, 0)
        pattern_id = pattern_list[counter % len(pattern_list)]
        section_pattern_counters[section_label] = counter + 1

        # Generate positions
        gen_fn = PATTERNS.get(pattern_id, _pairs_facing)
        raw_positions = gen_fn(dancer_count)

        positions = []
        for i, (x, y) in enumerate(raw_positions):
            if i < len(dancers):
                positions.append({
                    "dancerId": dancers[i]["id"],
                    "x": round(x, 3),
                    "y": round(y, 3),
                })

        keyframes.append({
            "beatIndex": beat_idx,
            "positions": positions,
        })

    # Add transition keyframes (2 beats before each boundary for smooth movement)
    transition_keyframes: list[dict] = []
    for i in range(1, len(keyframes)):
        trans_beat = keyframes[i]["beatIndex"] - 2
        if trans_beat > 0 and trans_beat > keyframes[i - 1]["beatIndex"]:
            # Use the previous pattern's positions for the transition start
            transition_keyframes.append({
                "beatIndex": trans_beat,
                "positions": keyframes[i - 1]["positions"],
            })

    all_keyframes = keyframes + transition_keyframes
    all_keyframes.sort(key=lambda kf: kf["beatIndex"])

    # Deduplicate by beatIndex (keep first occurrence)
    seen: set[int] = set()
    deduped: list[dict] = []
    for kf in all_keyframes:
        if kf["beatIndex"] not in seen:
            seen.add(kf["beatIndex"])
            deduped.append(kf)

    return {
        "version": 1,
        "dancers": dancers,
        "keyframes": deduped,
    }
