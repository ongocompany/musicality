"""
Supabase JWT 검증.
Authorization: Bearer {supabase_access_token} → Supabase auth.getUser()로 검증.
JWT secret 없이도 동작 — Supabase API로 토큰 유효성 확인.
"""

import logging
import os

import httpx
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def get_user_id(request: Request) -> str:
    """Extract and verify user_id from Supabase access token. Raises 401 on failure."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = auth_header[7:]

    try:
        # Supabase auth.getUser() — validates token and returns user info
        resp = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {token}",
            },
            timeout=5,
        )

        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        data = resp.json()
        user_id = data.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user id")

        return user_id

    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth verification failed: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
