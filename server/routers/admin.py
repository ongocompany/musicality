"""
Admin API routes — dashboard stats, announcements CRUD, user/crew listing.
"""

import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from services.supabase_client import get_supabase

router = APIRouter()


@router.get("/stats")
async def dashboard_stats():
    """Overview stats for admin dashboard."""
    sb = get_supabase()

    profiles = sb.table("profiles").select("id", count="exact").execute()
    crews = sb.table("crews").select("id", count="exact").execute()
    tracks = sb.table("player_tracks").select("id", count="exact").execute()
    announcements = sb.table("announcements").select("id", count="exact").eq("active", True).execute()

    return {
        "total_users": profiles.count or 0,
        "total_crews": crews.count or 0,
        "total_tracks": tracks.count or 0,
        "active_announcements": announcements.count or 0,
    }


# ─── Announcements ──────────────────────────────────────

@router.get("/announcements")
async def list_announcements():
    """List all announcements (active + inactive)."""
    sb = get_supabase()
    result = sb.table("announcements").select("*").order("created_at", desc=True).execute()
    return result.data


@router.post("/announcements")
async def create_announcement(body: dict):
    """Create a new announcement."""
    sb = get_supabase()

    title = body.get("title", "").strip()
    content = body.get("body", "").strip()
    priority = body.get("priority", "normal")

    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and body required")

    result = sb.table("announcements").insert({
        "title": title,
        "body": content,
        "priority": priority,
        "active": True,
    }).execute()

    return result.data[0] if result.data else {"status": "created"}


@router.patch("/announcements/{ann_id}")
async def update_announcement(ann_id: str, body: dict):
    """Update announcement (toggle active, edit content)."""
    sb = get_supabase()

    updates = {}
    if "active" in body:
        updates["active"] = body["active"]
    if "title" in body:
        updates["title"] = body["title"]
    if "body" in body:
        updates["body"] = body["body"]
    if "priority" in body:
        updates["priority"] = body["priority"]

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    sb.table("announcements").update(updates).eq("id", ann_id).execute()
    return {"status": "updated"}


# ─── Users ──────────────────────────────────────────────

@router.get("/users")
async def list_users():
    """List all registered users with profile info."""
    sb = get_supabase()

    profiles = sb.table("profiles").select("*").order("created_at", desc=True).execute()

    users = []
    for p in profiles.data:
        users.append({
            "id": p.get("id"),
            "display_name": p.get("display_name"),
            "nickname": p.get("nickname"),
            "email": p.get("email"),
            "provider": p.get("provider"),
            "avatar_url": p.get("avatar_url"),
            "created_at": p.get("created_at"),
        })

    return users


# ─── Crews ──────────────────────────────────────────────

@router.get("/crews")
async def list_crews():
    """List all crews with member counts."""
    sb = get_supabase()

    crews = sb.table("crews").select("*").order("created_at", desc=True).execute()

    result = []
    for c in crews.data:
        # Get member count
        members = sb.table("crew_members").select("id", count="exact").eq("crew_id", c["id"]).execute()

        # Get captain name
        captain_name = None
        if c.get("captain_id"):
            profile = sb.table("profiles").select("display_name,nickname").eq("id", c["captain_id"]).limit(1).execute()
            if profile.data:
                captain_name = profile.data[0].get("display_name") or profile.data[0].get("nickname")

        result.append({
            **c,
            "member_count": members.count or 0,
            "captain_name": captain_name,
        })

    return result
