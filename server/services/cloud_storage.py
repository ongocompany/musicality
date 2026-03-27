"""
Cloud Library storage service.

- cloud_tracks Supabase upsert (fingerprint 기반 dedup)
- MP3 192kbps 변환 및 로컬 저장
- cloud_track_id 조회
"""

import hashlib
import json
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

CLOUD_AUDIO_DIR = Path("/mnt/nvme/cloud_audio")
CLOUD_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

TARGET_BITRATE = "192k"


# ══════════════════════════════════════════════════════════════════
# Supabase client (reuse from analysis_cache)
# ══════════════════════════════════════════════════════════════════

def _get_supabase():
    from services.analysis_cache import _get_supabase as _get_sb
    return _get_sb()


# ══════════════════════════════════════════════════════════════════
# 192kbps 변환
# ══════════════════════════════════════════════════════════════════

def _get_storage_path(fingerprint: str) -> Path:
    """fingerprint 해시 기반 저장 경로. 디렉토리 분산."""
    fp_hash = hashlib.md5(fingerprint.encode()).hexdigest()
    subdir = fp_hash[:2]
    return CLOUD_AUDIO_DIR / subdir / f"{fp_hash}.mp3"


def convert_to_192kbps(input_path: str, fingerprint: str) -> Optional[str]:
    """MP3를 192kbps로 변환하여 cloud_audio에 저장. 이미 있으면 스킵."""
    output_path = _get_storage_path(fingerprint)
    if output_path.exists():
        logger.debug(f"Cloud audio already exists: {output_path}")
        return str(output_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        # ffmpeg: 입력 비트레이트 확인
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=bit_rate",
             "-of", "default=noprint_wrappers=1:nokey=1", input_path],
            capture_output=True, text=True, timeout=10,
        )
        input_bitrate = int(probe.stdout.strip()) if probe.stdout.strip() else 0

        # 128kbps 이하면 변환 없이 복사
        if 0 < input_bitrate <= 128000:
            import shutil
            shutil.copy2(input_path, str(output_path))
            logger.info(f"Cloud audio copied (low bitrate {input_bitrate//1000}k): {output_path.name}")
            return str(output_path)

        # 192kbps로 변환
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", input_path, "-b:a", TARGET_BITRATE,
             "-map_metadata", "0", "-id3v2_version", "3",
             str(output_path)],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            logger.error(f"ffmpeg failed: {result.stderr[:200]}")
            if output_path.exists():
                output_path.unlink()
            return None

        logger.info(f"Cloud audio saved (192k): {output_path.name} ({output_path.stat().st_size // 1024}KB)")
        return str(output_path)

    except Exception as e:
        logger.error(f"Cloud audio conversion failed: {e}")
        if output_path.exists():
            output_path.unlink()
        return None


# ══════════════════════════════════════════════════════════════════
# cloud_tracks upsert
# ══════════════════════════════════════════════════════════════════

def lookup_cloud_track_by_fingerprint(fingerprint: str) -> Optional[str]:
    """fingerprint로 cloud_track_id 조회. 없으면 None."""
    try:
        client = _get_supabase()
        if not client:
            return None
        fp_hash = hashlib.md5(fingerprint.encode()).hexdigest()
        resp = (client.table("cloud_tracks")
                .select("id")
                .eq("fp_hash", fp_hash)
                .limit(1)
                .execute())
        if resp.data:
            return resp.data[0]["id"]
    except Exception as e:
        logger.warning(f"cloud_track lookup failed: {e}")
    return None


def upsert_cloud_track(
    fingerprint: str,
    file_hash: str,
    file_size: int,
    result,  # AnalysisResult
    storage_path: Optional[str] = None,
) -> Optional[str]:
    """
    cloud_tracks에 upsert. 이미 있으면 upload_count만 증가.
    Returns cloud_track_id or None.
    """
    try:
        client = _get_supabase()
        if not client:
            return None

        fp_hash = hashlib.md5(fingerprint.encode()).hexdigest()

        # 기존 레코드 확인
        existing = (client.table("cloud_tracks")
                    .select("id, upload_count")
                    .eq("fp_hash", fp_hash)
                    .limit(1)
                    .execute())

        if existing.data:
            # 이미 있음 → upload_count 증가, storage_path 업데이트
            track_id = existing.data[0]["id"]
            update_data = {
                "upload_count": existing.data[0]["upload_count"] + 1,
            }
            if storage_path:
                update_data["storage_path"] = storage_path
                update_data["file_size"] = Path(storage_path).stat().st_size if Path(storage_path).exists() else file_size
            client.table("cloud_tracks").update(update_data).eq("id", track_id).execute()
            logger.info(f"cloud_track exists, upload_count++ : {track_id[:8]}")
            return track_id

        # 새 레코드
        metadata = result.metadata
        title = ""
        artist = None
        album = None
        album_art_url = None
        if metadata:
            title = metadata.title or ""
            artist = metadata.artist
            album = metadata.album
            album_art_url = metadata.album_art_url
        if not title:
            title = f"Track-{fp_hash[:8]}"

        sections_json = []
        if result.sections:
            sections_json = [
                {"label": s.label, "start_time": s.start_time,
                 "end_time": s.end_time, "confidence": s.confidence}
                for s in result.sections
            ]

        row = {
            "fingerprint": fingerprint,
            "file_hash": file_hash,
            "title": title,
            "artist": artist,
            "album": album,
            "album_art_url": album_art_url,
            "duration": result.duration,
            "bpm": result.bpm,
            "format": "mp3",
            "file_size": Path(storage_path).stat().st_size if storage_path and Path(storage_path).exists() else file_size,
            "storage_path": storage_path,
            "beats": result.beats,
            "downbeats": result.downbeats,
            "beats_per_bar": result.beats_per_bar,
            "confidence": result.confidence,
            "sections": sections_json,
            "phrase_boundaries": result.phrase_boundaries,
            "waveform_peaks": result.waveform_peaks,
            "upload_count": 1,
        }

        resp = client.table("cloud_tracks").insert(row).execute()
        if resp.data:
            track_id = resp.data[0]["id"]
            logger.info(f"cloud_track created: {track_id[:8]} ({title[:30]})")
            return track_id

    except Exception as e:
        logger.error(f"cloud_track upsert failed: {e}")
    return None


def register_cloud_track_async(
    fingerprint: str,
    file_hash: str,
    file_size: int,
    result,  # AnalysisResult
    source_file_path: Optional[str] = None,
    delete_source_after: bool = False,
):
    """
    비동기로 cloud_track 등록 + 192kbps 변환.
    분석 완료 후 호출. 분석 응답을 지연시키지 않음.
    delete_source_after=True이면 변환 완료 후 소스 파일 삭제.
    """
    def _run():
        storage_path = None
        # 소스 파일이 있고 오디오 파일이면 192kbps 변환
        if source_file_path and Path(source_file_path).exists():
            ext = Path(source_file_path).suffix.lower()
            if ext in {'.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'}:
                storage_path = convert_to_192kbps(source_file_path, fingerprint)

        upsert_cloud_track(fingerprint, file_hash, file_size, result, storage_path)

        # 변환 완료 후 소스 파일 삭제
        if delete_source_after and source_file_path:
            try:
                p = Path(source_file_path)
                if p.exists():
                    p.unlink()
            except Exception:
                pass

    threading.Thread(target=_run, daemon=True).start()
