"""
Global analysis cache service.
Two-tier cache: SHA-256 file hash (exact match) → Chromaprint fingerprint (same song, different file).
All operations are wrapped in try/except — cache failures never break analysis.
"""

import hashlib
import logging
import os
from typing import Optional

from models.schemas import AnalysisResult, SectionInfo, TrackMetadata

logger = logging.getLogger(__name__)

CURRENT_ANALYZER_VERSION = "v2.2"
HASH_CHUNK_SIZE = 8192  # 8KB chunks for SHA-256 streaming
FINGERPRINT_SIMILARITY_THRESHOLD = 0.7  # 70% bit-level match = same song


# ── Helpers ──────────────────────────────────────────────────────

def compute_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file. ~200ms for 10MB file."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(HASH_CHUNK_SIZE)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def _get_supabase():
    """Get Supabase client with short timeout (lazy import to avoid startup issues)."""
    from supabase import create_client, ClientOptions
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        return None
    # 5s timeout to prevent Supabase outages from blocking the analysis server
    # (default is 120s which can hang the entire uvicorn worker)
    opts = ClientOptions(postgrest_client_timeout=5)
    return create_client(url, key, options=opts)


def _row_to_result(row: dict, file_hash: str = "") -> AnalysisResult:
    """Convert a DB row to AnalysisResult."""
    sections = []
    for s in (row.get("sections") or []):
        sections.append(SectionInfo(
            label=s.get("label", ""),
            start_time=s.get("start_time", 0),
            end_time=s.get("end_time", 0),
            confidence=s.get("confidence", 0),
        ))

    # Restore metadata if stored
    metadata = None
    meta_raw = row.get("metadata")
    if meta_raw and isinstance(meta_raw, dict):
        metadata = TrackMetadata(**meta_raw)

    return AnalysisResult(
        bpm=row["bpm"],
        beats=row.get("beats") or [],
        downbeats=row.get("downbeats") or [],
        duration=row["duration"],
        beats_per_bar=row.get("beats_per_bar", 4),
        confidence=row.get("confidence", 0),
        sections=sections,
        phrase_boundaries=row.get("phrase_boundaries") or [],
        waveform_peaks=row.get("waveform_peaks") or [],
        fingerprint=row.get("fingerprint") or "",
        cached=True,
        file_hash=file_hash or row.get("file_hash", ""),
        metadata=metadata,
        analyzer_engine=row.get("analyzer_engine") or "",
    )


def _increment_hit(client, row: dict) -> None:
    """Increment hit_count (fire-and-forget)."""
    try:
        client.table("analysis_cache").update({
            "hit_count": row["hit_count"] + 1,
            "updated_at": "now()",
        }).eq("id", row["id"]).execute()
    except Exception:
        pass


# ── Fingerprint comparison ───────────────────────────────────────

def _decode_fingerprint(fp_string: str):
    """Decode compressed Chromaprint fingerprint to raw integer array."""
    try:
        import chromaprint
        raw, version = chromaprint.decode_fingerprint(
            fp_string.encode("utf-8") if isinstance(fp_string, str) else fp_string
        )
        return raw
    except Exception:
        return None


def _fingerprint_similarity(fp1_raw, fp2_raw) -> float:
    """Compute bit-level similarity between two raw fingerprints (0.0-1.0)."""
    if not fp1_raw or not fp2_raw:
        return 0.0
    min_len = min(len(fp1_raw), len(fp2_raw))
    max_len = max(len(fp1_raw), len(fp2_raw))
    if min_len == 0 or min_len / max_len < 0.5:
        return 0.0  # Duration too different
    matching_bits = 0
    total_bits = min_len * 32
    for i in range(min_len):
        xor = fp1_raw[i] ^ fp2_raw[i]
        matching_bits += 32 - bin(xor & 0xFFFFFFFF).count("1")
    return matching_bits / total_bits


def compute_fingerprint(file_path: str) -> tuple[float, str]:
    """
    Compute Chromaprint audio fingerprint. ~1-2s.
    Returns (duration_seconds, fingerprint_string).
    """
    import acoustid
    duration, fp_encoded = acoustid.fingerprint_file(file_path)
    fp_str = fp_encoded.decode("utf-8") if isinstance(fp_encoded, bytes) else str(fp_encoded)
    return duration, fp_str


# ── Cache operations ─────────────────────────────────────────────

def lookup_cache(file_hash: str) -> Optional[AnalysisResult]:
    """
    Tier 1: Look up cached analysis by SHA-256 file hash (exact file match).
    Returns AnalysisResult on hit, None on miss.
    """
    try:
        client = _get_supabase()
        if client is None:
            logger.warning("Supabase not configured, skipping cache lookup")
            return None

        response = (
            client.table("analysis_cache")
            .select("*")
            .eq("file_hash", file_hash)
            .eq("analyzer_version", CURRENT_ANALYZER_VERSION)
            .limit(1)
            .execute()
        )

        if not response.data:
            return None

        row = response.data[0]
        _increment_hit(client, row)
        return _row_to_result(row, file_hash)

    except Exception as e:
        logger.warning(f"Cache lookup failed: {e}")
        return None


def lookup_cache_by_fingerprint(fingerprint: str, duration: float) -> Optional[AnalysisResult]:
    """
    Tier 2: Look up cached analysis by audio fingerprint (same song, different file).
    Queries candidates with similar duration (±5s), then compares fingerprints.
    Returns AnalysisResult on match, None otherwise.
    """
    try:
        if not fingerprint:
            return None

        client = _get_supabase()
        if client is None:
            return None

        # Query candidates: similar duration + has fingerprint + same analyzer version
        response = (
            client.table("analysis_cache")
            .select("*")
            .eq("analyzer_version", CURRENT_ANALYZER_VERSION)
            .gte("duration", duration - 5.0)
            .lte("duration", duration + 5.0)
            .neq("fingerprint", "")
            .execute()
        )

        if not response.data:
            return None

        # Fast path: exact fingerprint string match
        for row in response.data:
            if row.get("fingerprint") == fingerprint:
                logger.info("Fingerprint exact match!")
                _increment_hit(client, row)
                return _row_to_result(row)

        # Slow path: decode and compute bit-level similarity
        uploaded_raw = _decode_fingerprint(fingerprint)
        if not uploaded_raw:
            logger.debug("Could not decode uploaded fingerprint, skipping fuzzy match")
            return None

        best_match = None
        best_similarity = 0.0

        for row in response.data:
            cached_fp = row.get("fingerprint", "")
            if not cached_fp:
                continue
            cached_raw = _decode_fingerprint(cached_fp)
            if not cached_raw:
                continue
            sim = _fingerprint_similarity(uploaded_raw, cached_raw)
            if sim > best_similarity:
                best_similarity = sim
                best_match = row

        if best_match and best_similarity >= FINGERPRINT_SIMILARITY_THRESHOLD:
            logger.info(f"Fingerprint fuzzy match! similarity={best_similarity:.3f}")
            _increment_hit(client, best_match)
            return _row_to_result(best_match)

        return None

    except Exception as e:
        logger.warning(f"Fingerprint cache lookup failed: {e}")
        return None


def store_in_cache(file_hash: str, file_size: int, result: AnalysisResult) -> None:
    """
    Store analysis result in cache. Insert-or-skip (no upsert to avoid DB locks).
    Fire-and-forget — errors are logged but never raised.
    """
    try:
        client = _get_supabase()
        if client is None:
            logger.warning("Supabase not configured, skipping cache store")
            return

        sections_json = [
            {
                "label": s.label,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "confidence": s.confidence,
            }
            for s in result.sections
        ]

        row = {
            "file_hash": file_hash,
            "file_size": file_size,
            "bpm": result.bpm,
            "beats": result.beats,
            "downbeats": result.downbeats,
            "duration": result.duration,
            "beats_per_bar": result.beats_per_bar,
            "confidence": result.confidence,
            "sections": sections_json,
            "phrase_boundaries": result.phrase_boundaries,
            "waveform_peaks": result.waveform_peaks,
            "fingerprint": result.fingerprint,
            "analyzer_version": CURRENT_ANALYZER_VERSION,
            "analyzer_engine": result.analyzer_engine,
            "hit_count": 0,
            "metadata": result.metadata.model_dump() if result.metadata else None,
        }

        # Check if already cached (avoid upsert which can lock DB with hash indexes)
        existing = (
            client.table("analysis_cache")
            .select("id")
            .eq("file_hash", file_hash)
            .eq("analyzer_version", CURRENT_ANALYZER_VERSION)
            .limit(1)
            .execute()
        )
        if existing.data:
            logger.info(f"Cache already exists for hash={file_hash[:12]}, skipping")
            return

        client.table("analysis_cache").insert(row).execute()
        logger.info(f"Cached analysis for hash={file_hash[:12]}...")

    except Exception as e:
        logger.warning(f"Cache store failed: {e}")
