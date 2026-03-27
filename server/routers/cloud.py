"""
Cloud Library API endpoints.

- GET  /cloud/library      — 사용자의 클라우드 라이브러리 목록
- GET  /cloud/download/{id} — MP3 파일 다운로드
- POST /cloud/register      — user_library에 곡 등록
- GET  /cloud/count         — 사용자의 라이브러리 곡 수
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from services.auth import get_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cloud", tags=["cloud"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
MAX_LIBRARY_SIZE = 1000

CLOUD_AUDIO_DIR = Path("/mnt/nvme/cloud_audio")


def _get_supabase():
    from services.analysis_cache import _get_supabase as _get_sb
    return _get_sb()


# ─── Models ───────────────────────────────────────────

class RegisterRequest(BaseModel):
    cloud_track_id: str
    custom_title: Optional[str] = None
    dance_style: str = "bachata"
    folder_name: Optional[str] = None


class RegisterByFingerprintRequest(BaseModel):
    fingerprint: str
    custom_title: Optional[str] = None
    dance_style: str = "bachata"
    folder_name: Optional[str] = None


# ─── GET /cloud/library ──────────────────────────────

@router.get("/library")
async def get_library(request: Request):
    """사용자의 클라우드 라이브러리 목록 반환."""
    user_id = get_user_id(request)

    try:
        client = _get_supabase()
        resp = (client.table("user_library")
                .select("id, cloud_track_id, custom_title, dance_style, folder_name, imported_at, "
                        "cloud_tracks(id, title, artist, album, album_art_url, duration, bpm, "
                        "file_size, fingerprint)")
                .eq("user_id", user_id)
                .eq("is_deleted", False)
                .order("imported_at", desc=True)
                .execute())

        items = []
        for row in resp.data:
            ct = row.get("cloud_tracks", {})
            items.append({
                "library_id": row["id"],
                "cloud_track_id": row["cloud_track_id"],
                "title": row.get("custom_title") or ct.get("title", ""),
                "artist": ct.get("artist"),
                "album": ct.get("album"),
                "album_art_url": ct.get("album_art_url"),
                "duration": ct.get("duration"),
                "bpm": ct.get("bpm"),
                "file_size": ct.get("file_size"),
                "fingerprint": ct.get("fingerprint", "")[:64],  # 앱에서 매칭용 prefix만
                "dance_style": row.get("dance_style", "bachata"),
                "folder_name": row.get("folder_name"),
                "imported_at": row.get("imported_at"),
            })

        return {"items": items, "count": len(items)}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_library failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch library")


# ─── GET /cloud/download/{cloud_track_id} ────────────

@router.get("/download/{cloud_track_id}")
async def download_track(cloud_track_id: str, request: Request):
    """MP3 파일 다운로드. 소유권 확인 후 제공."""
    user_id = get_user_id(request)

    try:
        client = _get_supabase()

        # 소유권 확인
        ownership = (client.table("user_library")
                     .select("id")
                     .eq("user_id", user_id)
                     .eq("cloud_track_id", cloud_track_id)
                     .eq("is_deleted", False)
                     .limit(1)
                     .execute())

        if not ownership.data:
            raise HTTPException(status_code=403, detail="Track not in your library")

        # cloud_track에서 storage_path 조회
        track = (client.table("cloud_tracks")
                 .select("storage_path, fingerprint, title")
                 .eq("id", cloud_track_id)
                 .limit(1)
                 .execute())

        if not track.data:
            raise HTTPException(status_code=404, detail="Track not found")

        storage_path = track.data[0].get("storage_path")
        if not storage_path or not Path(storage_path).exists():
            # storage_path가 없으면 fingerprint로 경로 추론
            fp = track.data[0].get("fingerprint", "")
            if fp:
                fp_hash = hashlib.md5(fp.encode()).hexdigest()
                fallback = CLOUD_AUDIO_DIR / fp_hash[:2] / f"{fp_hash}.mp3"
                if fallback.exists():
                    storage_path = str(fallback)

        if not storage_path or not Path(storage_path).exists():
            raise HTTPException(status_code=404, detail="Audio file not available yet")

        title = track.data[0].get("title", "track")
        safe_title = "".join(c if c.isalnum() or c in "-_ " else "_" for c in title)[:50]

        return FileResponse(
            storage_path,
            media_type="audio/mpeg",
            filename=f"{safe_title}.mp3",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"download_track failed: {e}")
        raise HTTPException(status_code=500, detail="Download failed")


# ─── POST /cloud/register ────────────────────────────

@router.post("/register")
async def register_track(body: RegisterRequest, request: Request):
    """user_library에 곡 등록. 1000곡 제한."""
    user_id = get_user_id(request)

    try:
        client = _get_supabase()

        # 이미 등록된 곡인지 확인
        existing = (client.table("user_library")
                    .select("id, is_deleted")
                    .eq("user_id", user_id)
                    .eq("cloud_track_id", body.cloud_track_id)
                    .limit(1)
                    .execute())

        if existing.data:
            row = existing.data[0]
            if row.get("is_deleted"):
                # soft-deleted → 복원
                client.table("user_library").update({
                    "is_deleted": False,
                    "custom_title": body.custom_title,
                    "dance_style": body.dance_style,
                    "folder_name": body.folder_name,
                }).eq("id", row["id"]).execute()
                return {"status": "restored", "library_id": row["id"]}
            else:
                return {"status": "already_registered", "library_id": row["id"]}

        # 1000곡 제한 확인
        count_resp = (client.table("user_library")
                      .select("id", count="exact")
                      .eq("user_id", user_id)
                      .eq("is_deleted", False)
                      .execute())
        current_count = count_resp.count or 0

        if current_count >= MAX_LIBRARY_SIZE:
            raise HTTPException(
                status_code=429,
                detail=f"Library limit reached ({MAX_LIBRARY_SIZE} tracks)"
            )

        # cloud_track 존재 확인
        track = (client.table("cloud_tracks")
                 .select("id")
                 .eq("id", body.cloud_track_id)
                 .limit(1)
                 .execute())
        if not track.data:
            raise HTTPException(status_code=404, detail="Cloud track not found")

        # 등록
        resp = (client.table("user_library")
                .insert({
                    "user_id": user_id,
                    "cloud_track_id": body.cloud_track_id,
                    "custom_title": body.custom_title,
                    "dance_style": body.dance_style,
                    "folder_name": body.folder_name,
                })
                .execute())

        library_id = resp.data[0]["id"] if resp.data else None
        logger.info(f"user_library registered: user={user_id[:8]} track={body.cloud_track_id[:8]}")

        return {"status": "registered", "library_id": library_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"register_track failed: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")


# ─── POST /cloud/register-by-fingerprint ──────────────

@router.post("/register-by-fingerprint")
async def register_by_fingerprint(body: RegisterByFingerprintRequest, request: Request):
    """fingerprint로 cloud_track을 찾아서 user_library에 등록."""
    user_id = get_user_id(request)

    try:
        client = _get_supabase()
        fp_hash = hashlib.md5(body.fingerprint.encode()).hexdigest()

        # cloud_track 찾기
        track = (client.table("cloud_tracks")
                 .select("id")
                 .eq("fp_hash", fp_hash)
                 .limit(1)
                 .execute())

        if not track.data:
            raise HTTPException(status_code=404, detail="Track not found in cloud")

        cloud_track_id = track.data[0]["id"]

        # 이미 등록됐는지 확인
        existing = (client.table("user_library")
                    .select("id, is_deleted")
                    .eq("user_id", user_id)
                    .eq("cloud_track_id", cloud_track_id)
                    .limit(1)
                    .execute())

        if existing.data:
            row = existing.data[0]
            if row.get("is_deleted"):
                client.table("user_library").update({"is_deleted": False}).eq("id", row["id"]).execute()
                return {"status": "restored", "cloud_track_id": cloud_track_id}
            return {"status": "already_registered", "cloud_track_id": cloud_track_id}

        # 1000곡 제한
        count_resp = (client.table("user_library")
                      .select("id", count="exact")
                      .eq("user_id", user_id)
                      .eq("is_deleted", False)
                      .execute())
        if (count_resp.count or 0) >= MAX_LIBRARY_SIZE:
            raise HTTPException(status_code=429, detail=f"Library limit reached ({MAX_LIBRARY_SIZE})")

        # 등록
        client.table("user_library").insert({
            "user_id": user_id,
            "cloud_track_id": cloud_track_id,
            "custom_title": body.custom_title,
            "dance_style": body.dance_style,
            "folder_name": body.folder_name,
        }).execute()

        logger.info(f"register-by-fp: user={user_id[:8]} track={cloud_track_id[:8]}")
        return {"status": "registered", "cloud_track_id": cloud_track_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"register_by_fingerprint failed: {e}")
        raise HTTPException(status_code=500, detail="Registration failed")


# ─── GET /cloud/count ─────────────────────────────────

@router.get("/count")
async def get_library_count(request: Request):
    """사용자의 라이브러리 곡 수."""
    user_id = get_user_id(request)

    try:
        client = _get_supabase()
        resp = (client.table("user_library")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("is_deleted", False)
                .execute())

        return {"count": resp.count or 0, "limit": MAX_LIBRARY_SIZE}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_library_count failed: {e}")
        raise HTTPException(status_code=500, detail="Count failed")
