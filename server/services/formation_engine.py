"""
Formation engine for Latin dance.

Generates initial formation (dancers + single keyframe at beat 0).
Instructors build their own choreography from this blank canvas.
"""

from __future__ import annotations

import math


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


def suggest_formations(
    dancer_count: int,
    dance_style: str,
    beats: list[float],
    bpm: float,
    sections: list[dict] | None = None,
    phrase_boundaries: list[float] | None = None,
) -> dict:
    """
    Generate initial formation data with dancers and a single starting keyframe.

    Args:
        dancer_count: Number of dancers (2-24)
        dance_style: 'bachata', 'salsa-on1', 'salsa-on2'
        beats: Beat timestamps in seconds
        bpm: Beats per minute
        sections: Section analysis results (unused, kept for API compat)
        phrase_boundaries: Phrase boundary timestamps (unused, kept for API compat)

    Returns:
        FormationData dict with dancers and one keyframe at beat 0
    """
    dancer_count = max(2, min(24, dancer_count))

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

    # Single keyframe at beat 0 (pairs-facing) — blank canvas for instructors
    raw_positions = _pairs_facing(dancer_count)
    positions = []
    for i, (x, y) in enumerate(raw_positions):
        if i < len(dancers):
            positions.append({
                "dancerId": dancers[i]["id"],
                "x": round(x, 3),
                "y": round(y, 3),
            })

    return {
        "version": 1,
        "dancers": dancers,
        "keyframes": [{"beatIndex": 0, "positions": positions}],
    }
