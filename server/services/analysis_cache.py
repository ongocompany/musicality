"""
Global analysis cache service.
Three-tier lookup: SQLite (local, fast) → Supabase hash → Supabase fingerprint.
Writes go to SQLite first, then async backup to Supabase.
All operations are wrapped in try/except — cache failures never break analysis.
"""

import hashlib
import json
import logging
import os
import sqlite3
import threading
import time
import uuid
from typing import Optional

from models.schemas import AnalysisResult, SectionInfo, TrackMetadata

logger = logging.getLogger(__name__)

CURRENT_ANALYZER_VERSION = "v2.2"
HASH_CHUNK_SIZE = 8192
FINGERPRINT_SIMILARITY_THRESHOLD = 0.7

# SQLite DB path (same as batch_pipeline uses)
_SQLITE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "analysis_cache.db")
_sqlite_conn: Optional[sqlite3.Connection] = None
_sqlite_lock = threading.Lock()


# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

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


def compute_fingerprint(file_path: str) -> tuple[float, str]:
    """Compute Chromaprint audio fingerprint. ~1-2s."""
    import acoustid
    duration, fp_encoded = acoustid.fingerprint_file(file_path)
    fp_str = fp_encoded.decode("utf-8") if isinstance(fp_encoded, bytes) else str(fp_encoded)
    return duration, fp_str


# ══════════════════════════════════════════════════════════════════
# SQLite (primary, fast)
# ══════════════════════════════════════════════════════════════════

def _get_sqlite() -> sqlite3.Connection:
    """Get thread-safe SQLite connection with schema ready."""
    global _sqlite_conn
    with _sqlite_lock:
        if _sqlite_conn is None:
            _sqlite_conn = sqlite3.connect(_SQLITE_PATH, timeout=10, check_same_thread=False)
            _sqlite_conn.row_factory = sqlite3.Row
            _sqlite_conn.execute("PRAGMA journal_mode=WAL")
            _sqlite_conn.execute("PRAGMA synchronous=NORMAL")
            _sqlite_conn.executescript("""
                CREATE TABLE IF NOT EXISTS analysis_cache (
                    id TEXT PRIMARY KEY,
                    file_hash TEXT NOT NULL,
                    file_size INTEGER,
                    bpm REAL NOT NULL,
                    beats TEXT NOT NULL DEFAULT '[]',
                    downbeats TEXT NOT NULL DEFAULT '[]',
                    duration REAL NOT NULL,
                    beats_per_bar INTEGER NOT NULL DEFAULT 4,
                    confidence REAL NOT NULL DEFAULT 0,
                    sections TEXT DEFAULT '[]',
                    phrase_boundaries TEXT DEFAULT '[]',
                    waveform_peaks TEXT DEFAULT '[]',
                    fingerprint TEXT DEFAULT '',
                    analyzer_version TEXT NOT NULL DEFAULT 'v2.2',
                    analyzer_engine TEXT DEFAULT '',
                    hit_count INTEGER NOT NULL DEFAULT 0,
                    metadata TEXT DEFAULT NULL,
                    recording_id TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_cache_hash ON analysis_cache(file_hash);
                CREATE INDEX IF NOT EXISTS idx_cache_fingerprint ON analysis_cache(fingerprint) WHERE fingerprint != '';
            """)
            logger.info(f"SQLite cache initialized: {_SQLITE_PATH}")
        return _sqlite_conn


def _sqlite_row_to_dict(row: sqlite3.Row) -> dict:
    """Convert SQLite Row to dict with JSON-parsed fields."""
    d = dict(row)
    for field in ("beats", "downbeats", "sections", "phrase_boundaries", "waveform_peaks"):
        if isinstance(d.get(field), str):
            try:
                d[field] = json.loads(d[field])
            except (json.JSONDecodeError, TypeError):
                d[field] = []
    if isinstance(d.get("metadata"), str):
        try:
            d["metadata"] = json.loads(d["metadata"])
        except (json.JSONDecodeError, TypeError):
            d["metadata"] = None
    return d


def _sqlite_lookup_hash(file_hash: str) -> Optional[dict]:
    """Look up by file hash in SQLite."""
    try:
        conn = _get_sqlite()
        with _sqlite_lock:
            row = conn.execute(
                "SELECT * FROM analysis_cache WHERE file_hash = ? AND analyzer_version = ? LIMIT 1",
                (file_hash, CURRENT_ANALYZER_VERSION)
            ).fetchone()
        if row:
            return _sqlite_row_to_dict(row)
    except Exception as e:
        logger.warning(f"SQLite hash lookup failed: {e}")
    return None


def _sqlite_lookup_fingerprint(fingerprint: str, duration: float) -> Optional[dict]:
    """Look up by fingerprint in SQLite (exact match first, then fuzzy)."""
    try:
        if not fingerprint:
            return None
        conn = _get_sqlite()
        with _sqlite_lock:
            # Exact fingerprint match
            row = conn.execute(
                "SELECT * FROM analysis_cache WHERE fingerprint = ? AND analyzer_version = ? LIMIT 1",
                (fingerprint, CURRENT_ANALYZER_VERSION)
            ).fetchone()
        if row:
            logger.info("SQLite fingerprint exact match!")
            return _sqlite_row_to_dict(row)

        # Fuzzy match: similar duration
        with _sqlite_lock:
            candidates = conn.execute(
                "SELECT * FROM analysis_cache WHERE analyzer_version = ? "
                "AND duration BETWEEN ? AND ? AND fingerprint != '' LIMIT 50",
                (CURRENT_ANALYZER_VERSION, duration - 5.0, duration + 5.0)
            ).fetchall()

        if not candidates:
            return None

        uploaded_raw = _decode_fingerprint(fingerprint)
        if not uploaded_raw:
            return None

        best_match = None
        best_sim = 0.0
        for cand in candidates:
            d = _sqlite_row_to_dict(cand)
            cached_raw = _decode_fingerprint(d.get("fingerprint", ""))
            if not cached_raw:
                continue
            sim = _fingerprint_similarity(uploaded_raw, cached_raw)
            if sim > best_sim:
                best_sim = sim
                best_match = d

        if best_match and best_sim >= FINGERPRINT_SIMILARITY_THRESHOLD:
            logger.info(f"SQLite fingerprint fuzzy match! similarity={best_sim:.3f}")
            return best_match

    except Exception as e:
        logger.warning(f"SQLite fingerprint lookup failed: {e}")
    return None


def _sqlite_store(file_hash: str, file_size: int, result: AnalysisResult) -> None:
    """Store analysis result in SQLite."""
    try:
        conn = _get_sqlite()
        sections_json = json.dumps([
            {"label": s.label, "start_time": s.start_time, "end_time": s.end_time, "confidence": s.confidence}
            for s in result.sections
        ])
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        with _sqlite_lock:
            conn.execute(
                """INSERT OR IGNORE INTO analysis_cache
                   (id, file_hash, file_size, bpm, beats, downbeats, duration,
                    beats_per_bar, confidence, sections, phrase_boundaries,
                    waveform_peaks, fingerprint, analyzer_version, analyzer_engine,
                    hit_count, metadata, recording_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, '', ?, ?)""",
                (
                    str(uuid.uuid4()), file_hash, file_size,
                    result.bpm, json.dumps(result.beats), json.dumps(result.downbeats),
                    result.duration, result.beats_per_bar, result.confidence,
                    sections_json, json.dumps(result.phrase_boundaries),
                    json.dumps(result.waveform_peaks), result.fingerprint,
                    CURRENT_ANALYZER_VERSION, result.analyzer_engine,
                    json.dumps(result.metadata.model_dump()) if result.metadata else None,
                    now, now,
                ),
            )
            conn.commit()
        logger.info(f"SQLite cached: hash={file_hash[:12]}")
    except Exception as e:
        logger.warning(f"SQLite store failed: {e}")


# ══════════════════════════════════════════════════════════════════
# Supabase (backup/fallback)
# ══════════════════════════════════════════════════════════════════

def _get_supabase():
    """Get Supabase client with short timeout."""
    from supabase import create_client, ClientOptions
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        return None
    opts = ClientOptions(postgrest_client_timeout=5)
    return create_client(url, key, options=opts)


def _supabase_store_async(file_hash: str, file_size: int, result: AnalysisResult) -> None:
    """Backup to Supabase in background thread (fire-and-forget)."""
    def _store():
        try:
            client = _get_supabase()
            if not client:
                return
            sections_json = [
                {"label": s.label, "start_time": s.start_time, "end_time": s.end_time, "confidence": s.confidence}
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
            existing = client.table("analysis_cache").select("id").eq("file_hash", file_hash).eq("analyzer_version", CURRENT_ANALYZER_VERSION).limit(1).execute()
            if not existing.data:
                client.table("analysis_cache").insert(row).execute()
                logger.debug(f"Supabase backup: hash={file_hash[:12]}")
        except Exception as e:
            logger.debug(f"Supabase backup failed (non-critical): {e}")

    threading.Thread(target=_store, daemon=True).start()


def _supabase_lookup_hash(file_hash: str) -> Optional[dict]:
    """Fallback hash lookup via Supabase."""
    try:
        client = _get_supabase()
        if not client:
            return None
        response = client.table("analysis_cache").select("*").eq("file_hash", file_hash).eq("analyzer_version", CURRENT_ANALYZER_VERSION).limit(1).execute()
        if response.data:
            return response.data[0]
    except Exception as e:
        logger.debug(f"Supabase hash lookup failed: {e}")
    return None


def _supabase_lookup_fingerprint(fingerprint: str, duration: float) -> Optional[dict]:
    """Fallback fingerprint lookup via Supabase."""
    try:
        if not fingerprint:
            return None
        client = _get_supabase()
        if not client:
            return None
        response = (
            client.table("analysis_cache").select("*")
            .eq("analyzer_version", CURRENT_ANALYZER_VERSION)
            .gte("duration", duration - 5.0).lte("duration", duration + 5.0)
            .neq("fingerprint", "").execute()
        )
        if not response.data:
            return None

        # Exact match
        for row in response.data:
            if row.get("fingerprint") == fingerprint:
                logger.info("Supabase fingerprint exact match!")
                return row

        # Fuzzy match
        uploaded_raw = _decode_fingerprint(fingerprint)
        if not uploaded_raw:
            return None
        best_match = None
        best_sim = 0.0
        for row in response.data:
            cached_raw = _decode_fingerprint(row.get("fingerprint", ""))
            if not cached_raw:
                continue
            sim = _fingerprint_similarity(uploaded_raw, cached_raw)
            if sim > best_sim:
                best_sim = sim
                best_match = row
        if best_match and best_sim >= FINGERPRINT_SIMILARITY_THRESHOLD:
            logger.info(f"Supabase fingerprint fuzzy match! similarity={best_sim:.3f}")
            return best_match
    except Exception as e:
        logger.debug(f"Supabase fingerprint lookup failed: {e}")
    return None


# ══════════════════════════════════════════════════════════════════
# Fingerprint comparison
# ══════════════════════════════════════════════════════════════════

def _decode_fingerprint(fp_string: str):
    try:
        import chromaprint
        raw, version = chromaprint.decode_fingerprint(
            fp_string.encode("utf-8") if isinstance(fp_string, str) else fp_string
        )
        return raw
    except Exception:
        return None


def _fingerprint_similarity(fp1_raw, fp2_raw) -> float:
    if not fp1_raw or not fp2_raw:
        return 0.0
    min_len = min(len(fp1_raw), len(fp2_raw))
    max_len = max(len(fp1_raw), len(fp2_raw))
    if min_len == 0 or min_len / max_len < 0.5:
        return 0.0
    matching_bits = 0
    total_bits = min_len * 32
    for i in range(min_len):
        xor = fp1_raw[i] ^ fp2_raw[i]
        matching_bits += 32 - bin(xor & 0xFFFFFFFF).count("1")
    return matching_bits / total_bits


# ══════════════════════════════════════════════════════════════════
# Public API (SQLite first → Supabase fallback)
# ══════════════════════════════════════════════════════════════════

def _row_to_result(row: dict, file_hash: str = "") -> AnalysisResult:
    """Convert a DB row (SQLite or Supabase) to AnalysisResult."""
    sections = []
    for s in (row.get("sections") or []):
        sections.append(SectionInfo(
            label=s.get("label", ""),
            start_time=s.get("start_time", 0),
            end_time=s.get("end_time", 0),
            confidence=s.get("confidence", 0),
        ))
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


def lookup_cache(file_hash: str) -> Optional[AnalysisResult]:
    """Look up by file hash: SQLite first → Supabase fallback."""
    # 1. SQLite (fast, local)
    row = _sqlite_lookup_hash(file_hash)
    if row:
        logger.info(f"Cache hit (SQLite hash): {file_hash[:12]}")
        return _row_to_result(row, file_hash)

    # 2. Supabase fallback
    row = _supabase_lookup_hash(file_hash)
    if row:
        logger.info(f"Cache hit (Supabase hash): {file_hash[:12]}")
        # Backfill to SQLite for next time
        result = _row_to_result(row, file_hash)
        _sqlite_store(file_hash, row.get("file_size", 0), result)
        return result

    return None


def lookup_cache_by_fingerprint(fingerprint: str, duration: float) -> Optional[AnalysisResult]:
    """Look up by fingerprint: SQLite first → Supabase fallback."""
    # 1. SQLite
    row = _sqlite_lookup_fingerprint(fingerprint, duration)
    if row:
        logger.info("Cache hit (SQLite fingerprint)")
        return _row_to_result(row)

    # 2. Supabase fallback
    row = _supabase_lookup_fingerprint(fingerprint, duration)
    if row:
        logger.info("Cache hit (Supabase fingerprint)")
        result = _row_to_result(row)
        # Backfill to SQLite
        _sqlite_store(row.get("file_hash", ""), row.get("file_size", 0), result)
        return result

    return None


def store_in_cache(file_hash: str, file_size: int, result: AnalysisResult) -> None:
    """Store in SQLite (sync) + Supabase (async backup)."""
    _sqlite_store(file_hash, file_size, result)
    _supabase_store_async(file_hash, file_size, result)
