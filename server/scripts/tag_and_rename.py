#!/usr/bin/env python3
"""
Tag & Rename analyzed mp3 files.
Adds ID3 tags (artist, title) from playlist_queue.json and fetches album art from iTunes.
Renames files from YouTube ID to "Artist - Title.mp3".

Does NOT affect analysis results — DB stores file_hash from analysis time,
and done/ files are not re-analyzed.

Usage:
    cd server
    venv/bin/python3 scripts/tag_and_rename.py /mnt/nvme/batch_analyze/done
    venv/bin/python3 scripts/tag_and_rename.py /mnt/nvme/batch_analyze/done --dry-run
    venv/bin/python3 scripts/tag_and_rename.py ~/musicality-worker/done --queue ~/musicality-worker/playlist_queue.json
"""
import argparse
import json
import logging
import os
import re
import time
from pathlib import Path

import requests
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC, ID3NoHeaderError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s",
                    datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

ITUNES_SEARCH_URL = "https://itunes.apple.com/search"
ITUNES_RATE_LIMIT = 0.35  # seconds between requests
YT_ID_RE = re.compile(r'^[-_a-zA-Z0-9]{11}$')


def parse_filename(stem: str) -> dict | None:
    """Try to extract artist/title from filename patterns.
    Supports: 'Artist - Title', 'Artist - Title [ytid]', 'Title only'
    Returns None for bare YouTube IDs with no info.
    """
    # Strip [youtube_id] suffix
    clean = re.sub(r'\s*\[[-_a-zA-Z0-9]{11}\]$', '', stem)

    # Skip bare YouTube IDs
    if YT_ID_RE.match(clean):
        return None

    # "Artist - Title" pattern
    if ' - ' in clean:
        parts = clean.split(' - ', 1)
        return {"artist": parts[0].strip(), "title": parts[1].strip()}

    # Title only — use as title, leave artist empty for iTunes search
    return {"artist": "", "title": clean.strip()}


def load_video_map(queue_path: str) -> dict:
    """Load video_id → {artist, title} mapping from playlist_queue.json."""
    with open(queue_path) as f:
        q = json.load(f)
    vid_map = {}
    for t in q.get("tracks", []):
        vid = t.get("video_id", "")
        if vid:
            vid_map[vid] = {
                "artist": t.get("artist", ""),
                "title": t.get("title", ""),
            }
    return vid_map


def sanitize_filename(name: str) -> str:
    """Remove characters not allowed in filenames."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name[:200]  # limit length


def fetch_album_art(artist: str, title: str) -> bytes | None:
    """Search iTunes for album art. Returns JPEG bytes or None."""
    try:
        query = f"{artist} {title}"
        resp = requests.get(ITUNES_SEARCH_URL, params={
            "term": query,
            "media": "music",
            "limit": 3,
        }, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("results", [])

        if not results:
            return None

        # Pick best match (first result usually good enough)
        art_url = results[0].get("artworkUrl100", "")
        if not art_url:
            return None

        # Get higher resolution (600x600)
        art_url = art_url.replace("100x100", "600x600")
        art_resp = requests.get(art_url, timeout=10)
        art_resp.raise_for_status()
        return art_resp.content

    except Exception:
        return None


def tag_and_rename(done_dir: Path, vid_map: dict, dry_run: bool = False):
    """Tag and rename all mp3 files in done_dir."""
    files = sorted(done_dir.glob("*.mp3"))
    logger.info(f"Found {len(files)} mp3 files in {done_dir}")

    stats = {"tagged": 0, "renamed": 0, "art_added": 0, "skipped": 0, "no_info": 0}

    for i, fp in enumerate(files, 1):
        stem = fp.stem
        info = vid_map.get(stem)

        # Fallback: parse from filename if not in queue
        if not info or not info.get("title"):
            info = parse_filename(stem)

        if not info or not info.get("title"):
            stats["no_info"] += 1
            continue

        artist = info.get("artist", "")
        title = info["title"]

        # Check if already tagged AND already renamed (skip if both done)
        try:
            tags = ID3(str(fp))
            has_artist_tag = bool(tags.get("TPE1"))
            has_art = bool(tags.getall("APIC"))
        except ID3NoHeaderError:
            tags = ID3()
            has_artist_tag = False
            has_art = False
        except Exception:
            tags = ID3()
            has_artist_tag = False
            has_art = False

        already_renamed = not YT_ID_RE.match(stem)
        if has_artist_tag and has_art and already_renamed:
            stats["skipped"] += 1
            continue

        if dry_run:
            display_name = f"{artist} - {title}" if artist else title
            new_name = sanitize_filename(display_name) + ".mp3"
            if new_name != fp.name:
                logger.info(f"  [{i}/{len(files)}] WOULD: {fp.name} → {new_name}")
            continue

        # 1. Add ID3 tags (if missing)
        if not has_artist_tag:
            if artist:
                tags.add(TPE1(encoding=3, text=artist))
            tags.add(TIT2(encoding=3, text=title))
            tags.save(str(fp))
            stats["tagged"] += 1

        # 2. Fetch album art (if missing)
        if not has_art:
            search_query = f"{artist} {title}" if artist else title
            art = fetch_album_art(artist or title, title if artist else "")
            if art:
                tags = ID3(str(fp))
                tags.add(APIC(
                    encoding=3,
                    mime="image/jpeg",
                    type=3,  # Cover (front)
                    desc="Cover",
                    data=art,
                ))
                tags.save(str(fp))
                stats["art_added"] += 1
            time.sleep(ITUNES_RATE_LIMIT)

        # 3. Rename file (only if still a YouTube ID)
        if YT_ID_RE.match(stem):
            display_name = f"{artist} - {title}" if artist else title
            new_name = sanitize_filename(display_name) + ".mp3"
            new_path = fp.parent / new_name

            if new_path.exists() and new_path != fp:
                new_name = sanitize_filename(f"{display_name} [{stem}]") + ".mp3"
                new_path = fp.parent / new_name

            fp.rename(new_path)
            stats["renamed"] += 1

        if i % 100 == 0:
            logger.info(f"  [{i}/{len(files)}] tagged={stats['tagged']}, art={stats['art_added']}, renamed={stats['renamed']}")

    logger.info(f"\nDone! tagged={stats['tagged']}, art={stats['art_added']}, "
                f"renamed={stats['renamed']}, skipped={stats['skipped']}, no_info={stats['no_info']}")


def main():
    parser = argparse.ArgumentParser(description="Tag and rename analyzed mp3 files")
    parser.add_argument("done_dir", type=str, help="Path to done/ folder")
    parser.add_argument("--queue", type=str, default=None,
                        help="Path to playlist_queue.json (default: auto-detect)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without changes")
    args = parser.parse_args()

    done_dir = Path(args.done_dir).resolve()
    if not done_dir.exists():
        logger.error(f"Directory not found: {done_dir}")
        return

    # Auto-detect queue file
    queue_path = args.queue
    if not queue_path:
        candidates = [
            done_dir.parent / "playlist_queue.json",
            Path("/mnt/nvme/batch_analyze/playlist_queue.json"),
        ]
        for c in candidates:
            if c.exists():
                queue_path = str(c)
                break

    if not queue_path or not Path(queue_path).exists():
        logger.error("playlist_queue.json not found. Use --queue to specify path.")
        return

    vid_map = load_video_map(queue_path)
    logger.info(f"Loaded {len(vid_map)} video ID mappings")

    tag_and_rename(done_dir, vid_map, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
