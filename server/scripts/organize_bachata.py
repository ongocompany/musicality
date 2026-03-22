"""
Bachata Library Organizer
=========================
Step 1: ID3 태그 있으면 그대로 사용
Step 2: 없으면 AcoustID 핑거프린트로 MusicBrainz 조회
Step 3: 그래도 없으면 파일명에서 파싱
Step 4: 중복 제거 (artist+title 같고 파일크기 유사)
Step 5: 앨범아트 없으면 iTunes Search API로 다운로드 후 ID3에 삽입
Step 6: Artist - Title.mp3 형식으로 리네임

Usage:
    python3 organize_bachata.py --scan-fast      # 스캔 (ID3+파일명, AcoustID 없이)
    python3 organize_bachata.py --scan           # 스캔 (ID3+AcoustID+파일명, 느림)
    python3 organize_bachata.py --dedup          # 중복 제거
    python3 organize_bachata.py --artwork        # 앨범아트 채우기
    python3 organize_bachata.py --rename         # 리네임
    python3 organize_bachata.py --all            # 전체 파이프라인 (scan-fast→dedup→artwork→rename)
"""

import os
import re
import json
import hashlib
import logging
import argparse
import time
from pathlib import Path
from collections import defaultdict

from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3, ID3NoHeaderError, APIC
from mutagen.mp3 import MP3

import acoustid
import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

SRC_DIR = "/mnt/nvme/bachata"
RESULT_FILE = "/mnt/nvme/bachata_scan.json"

# AcoustID config
ACOUSTID_API_KEY = os.getenv("ACOUSTID_API_KEY", "5urpeh7f0F")
ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"

# iTunes Search API (no key needed, 20 req/min limit)
ITUNES_SEARCH_URL = "https://itunes.apple.com/search"

MB_HEADERS = {
    "User-Agent": "Ritmo/1.0.0 (https://github.com/ongocompany/musicality)",
    "Accept": "application/json",
}
_last_api_call = 0.0

SIZE_SIMILARITY = 0.05


# ── Helpers ──────────────────────────────────────────────────────

def _api_throttle(min_interval=1.0):
    global _last_api_call
    elapsed = time.time() - _last_api_call
    if elapsed < min_interval:
        time.sleep(min_interval - elapsed)
    _last_api_call = time.time()


def _clean_text(text: str) -> str:
    if not text:
        return ""
    text = text.strip()
    text = re.sub(r'[<>:"/\\|?*]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _normalize_for_compare(text: str) -> str:
    if not text:
        return ""
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s]', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def _get_file_size(filepath: str) -> int:
    return os.path.getsize(filepath)


def _has_album_art(filepath: str) -> bool:
    """Check if mp3 file has embedded album art."""
    try:
        tags = ID3(filepath)
        apic = tags.getall('APIC')
        return bool(apic and len(apic[0].data) > 1000)
    except Exception:
        return False


# ── Step 1: ID3 Tag Reader ──────────────────────────────────────

def read_id3_tags(filepath: str) -> dict:
    try:
        tags = EasyID3(filepath)
        artist = (tags.get('artist', [''])[0]).strip()
        title = (tags.get('title', [''])[0]).strip()
        album = (tags.get('album', [''])[0]).strip()
        return {"artist": artist, "title": title, "album": album, "source": "id3"}
    except (ID3NoHeaderError, Exception):
        return {"artist": "", "title": "", "album": "", "source": ""}


# ── Step 2: AcoustID Lookup ─────────────────────────────────────

def acoustid_lookup(filepath: str) -> dict:
    try:
        _api_throttle(0.34)
        duration, fp_encoded = acoustid.fingerprint_file(filepath)
        fp_str = fp_encoded.decode("utf-8") if isinstance(fp_encoded, bytes) else str(fp_encoded)

        payload = {
            "client": ACOUSTID_API_KEY,
            "fingerprint": fp_str,
            "duration": int(duration),
            "meta": "recordings+releasegroups+compress",
        }
        resp = requests.post(ACOUSTID_URL, data=payload, timeout=10)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != "ok":
            return {"artist": "", "title": "", "album": "", "source": ""}

        results = data.get("results", [])
        if not results:
            return {"artist": "", "title": "", "album": "", "source": ""}

        best = max(results, key=lambda r: r.get("score", 0))
        if best.get("score", 0) < 0.5:
            return {"artist": "", "title": "", "album": "", "source": ""}

        recordings = best.get("recordings", [])
        if not recordings:
            return {"artist": "", "title": "", "album": "", "source": ""}

        rec = recordings[0]
        artist = ""
        artists = rec.get("artists", [])
        if artists:
            artist = artists[0].get("name", "")

        title = rec.get("title", "")
        album = ""
        releases = rec.get("releasegroups", [])
        if releases:
            album = releases[0].get("title", "")

        if artist or title:
            return {"artist": artist, "title": title, "album": album, "source": "acoustid"}

        return {"artist": "", "title": "", "album": "", "source": ""}

    except Exception as e:
        logger.debug(f"AcoustID failed for {filepath}: {e}")
        return {"artist": "", "title": "", "album": "", "source": ""}


# ── Step 3: Filename Parser ─────────────────────────────────────

def parse_filename(filename: str) -> dict:
    name = os.path.splitext(filename)[0]
    cleaned = re.sub(r'^\([^)]*\)\s*', '', name).strip()
    cleaned = re.sub(r'^\d{1,2}\.\s*', '', cleaned).strip()

    if not cleaned:
        return {"artist": "", "title": name, "album": "", "source": "filename"}

    match = re.match(r'^(.+?)\s*[-–—]\s+(.+)$', cleaned)
    if match:
        part1 = match.group(1).strip()
        part2 = match.group(2).strip()
        return {"artist": part2, "title": part1, "album": "", "source": "filename_parsed"}

    if '·' in cleaned:
        parts = [p.strip() for p in cleaned.split('·')]
        title = parts[0]
        artist = ' · '.join(parts[1:]) if len(parts) > 1 else ""
        return {"artist": artist, "title": title, "album": "", "source": "filename_dot"}

    return {"artist": "", "title": cleaned, "album": "", "source": "filename_raw"}


# ── Album Art: iTunes Search ────────────────────────────────────

def _search_itunes_artwork(artist: str, title: str) -> bytes | None:
    """Search iTunes for album art, return image bytes or None."""
    try:
        # Clean search terms
        query = f"{artist} {title}" if artist else title
        query = re.sub(r'\(.*?\)', '', query).strip()  # Remove parentheses
        query = re.sub(r'\[.*?\]', '', query).strip()  # Remove brackets
        query = query[:80]  # Limit length

        if not query:
            return None

        _api_throttle(3.1)  # iTunes: 20 req/min ≈ 1 req per 3s

        resp = requests.get(ITUNES_SEARCH_URL, params={
            "term": query,
            "media": "music",
            "entity": "song",
            "limit": 5,
        }, timeout=10, headers=MB_HEADERS)
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        if not results:
            return None

        # Pick best match: prefer exact title match
        best = None
        title_norm = _normalize_for_compare(title)
        for r in results:
            if _normalize_for_compare(r.get("trackName", "")) == title_norm:
                best = r
                break
        if not best:
            best = results[0]

        # Get high-res artwork (600x600)
        art_url = best.get("artworkUrl100", "")
        if not art_url:
            return None

        art_url = art_url.replace("100x100bb", "600x600bb")

        img_resp = requests.get(art_url, timeout=15)
        img_resp.raise_for_status()

        if len(img_resp.content) < 1000:
            return None

        return img_resp.content

    except Exception as e:
        logger.debug(f"iTunes search failed for '{query}': {e}")
        return None


def _embed_album_art(filepath: str, image_data: bytes) -> bool:
    """Embed album art into mp3 file's ID3 tags."""
    try:
        try:
            tags = ID3(filepath)
        except ID3NoHeaderError:
            tags = ID3()

        # Detect image type
        mime = "image/jpeg"
        if image_data[:4] == b'\x89PNG':
            mime = "image/png"

        tags.delall('APIC')
        tags.add(APIC(
            encoding=3,  # UTF-8
            mime=mime,
            type=3,  # Cover (front)
            desc='Cover',
            data=image_data,
        ))
        tags.save(filepath)
        return True

    except Exception as e:
        logger.debug(f"Failed to embed art in {filepath}: {e}")
        return False


def fetch_artwork(scan_results, dry_run=False):
    """Fetch and embed album art for files missing it."""
    files = scan_results
    total = len(files)

    need_art = []
    for r in files:
        filepath = os.path.join(SRC_DIR, r["original"])
        if os.path.exists(filepath) and not _has_album_art(filepath):
            need_art.append(r)

    logger.info(f"Files needing artwork: {len(need_art)} / {total}")

    if dry_run:
        for r in need_art[:20]:
            logger.info(f"  [DRY] Would search: {r['artist']} - {r['title']}")
        if len(need_art) > 20:
            logger.info(f"  ... and {len(need_art) - 20} more")
        return 0

    found = 0
    failed = 0

    for i, r in enumerate(need_art):
        filepath = os.path.join(SRC_DIR, r["original"])
        if not os.path.exists(filepath):
            continue

        image_data = _search_itunes_artwork(r.get("artist", ""), r.get("title", ""))

        if image_data:
            if _embed_album_art(filepath, image_data):
                found += 1
                logger.info(f"  [{i+1}/{len(need_art)}] ✓ {r['artist']} - {r['title']}")
            else:
                failed += 1
        else:
            failed += 1
            if (i + 1) % 50 == 0:
                logger.info(f"  [{i+1}/{len(need_art)}] progress: found={found} failed={failed}")

    logger.info(f"Artwork: {found} added, {failed} not found")
    return found


# ── Scan ─────────────────────────────────────────────────────────

def scan_all(use_acoustid=True):
    files = sorted([f for f in os.listdir(SRC_DIR) if f.lower().endswith('.mp3')])
    total = len(files)
    logger.info(f"Scanning {total} files in {SRC_DIR}")

    results = []
    stats = {"id3": 0, "acoustid": 0, "filename": 0, "no_info": 0}

    for i, filename in enumerate(files):
        filepath = os.path.join(SRC_DIR, filename)
        file_size = _get_file_size(filepath)

        meta = read_id3_tags(filepath)

        if use_acoustid and (not meta["artist"] or not meta["title"]):
            acoustid_meta = acoustid_lookup(filepath)
            if acoustid_meta["artist"] or acoustid_meta["title"]:
                if not meta["artist"] and acoustid_meta["artist"]:
                    meta["artist"] = acoustid_meta["artist"]
                if not meta["title"] and acoustid_meta["title"]:
                    meta["title"] = acoustid_meta["title"]
                if not meta["album"] and acoustid_meta["album"]:
                    meta["album"] = acoustid_meta["album"]
                if meta["source"] != "id3":
                    meta["source"] = acoustid_meta["source"]

        if not meta["artist"] or not meta["title"]:
            fn_meta = parse_filename(filename)
            if not meta["artist"] and fn_meta["artist"]:
                meta["artist"] = fn_meta["artist"]
            if not meta["title"] and fn_meta["title"]:
                meta["title"] = fn_meta["title"]
            if meta["source"] not in ("id3", "acoustid"):
                meta["source"] = fn_meta["source"]

        artist = _clean_text(meta["artist"])
        title = _clean_text(meta["title"])

        if artist and title:
            new_name = f"{artist} - {title}.mp3"
        elif title:
            new_name = f"{title}.mp3"
        else:
            new_name = filename

        if meta["source"] == "id3":
            stats["id3"] += 1
        elif meta["source"] == "acoustid":
            stats["acoustid"] += 1
        elif meta["source"].startswith("filename"):
            stats["filename"] += 1
        else:
            stats["no_info"] += 1

        results.append({
            "original": filename,
            "new_name": new_name,
            "artist": meta["artist"],
            "title": meta["title"],
            "album": meta["album"],
            "source": meta["source"],
            "file_size": file_size,
        })

        if (i + 1) % 100 == 0:
            logger.info(f"  [{i+1}/{total}] id3={stats['id3']} acoustid={stats['acoustid']} filename={stats['filename']} no_info={stats['no_info']}")

    with open(RESULT_FILE, "w", encoding="utf-8") as f:
        json.dump({"stats": stats, "total": total, "files": results}, f, ensure_ascii=False, indent=2)

    logger.info(f"Scan complete! Results saved to {RESULT_FILE}")
    logger.info(f"  ID3 tags:  {stats['id3']}")
    logger.info(f"  AcoustID:  {stats['acoustid']}")
    logger.info(f"  Filename:  {stats['filename']}")
    logger.info(f"  No info:   {stats['no_info']}")

    return results


# ── Dedup ────────────────────────────────────────────────────────

def find_duplicates(results):
    groups = defaultdict(list)
    for r in results:
        key = _normalize_for_compare(f"{r['artist']} {r['title']}")
        if key:
            groups[key].append(r)

    duplicates = []
    for key, items in groups.items():
        if len(items) < 2:
            continue
        items.sort(key=lambda x: x["file_size"], reverse=True)
        keep = items[0]
        for item in items[1:]:
            size_diff = abs(keep["file_size"] - item["file_size"]) / max(keep["file_size"], 1)
            if size_diff <= SIZE_SIMILARITY:
                duplicates.append({
                    "keep": keep["original"],
                    "remove": item["original"],
                    "artist_title": f"{items[0]['artist']} - {items[0]['title']}",
                    "size_diff_pct": round(size_diff * 100, 1),
                })

    logger.info(f"Found {len(duplicates)} duplicate pairs")
    return duplicates


def remove_duplicates(results):
    dupes = find_duplicates(results)
    removed = 0
    for d in dupes:
        path = os.path.join(SRC_DIR, d["remove"])
        if os.path.exists(path):
            os.remove(path)
            removed += 1
    logger.info(f"Removed {removed} duplicate files")
    return removed


# ── Rename ───────────────────────────────────────────────────────

def rename_files(results, dry_run=False):
    renamed = 0
    skipped = 0
    conflicts = 0
    used_names = set()

    for r in results:
        old_path = os.path.join(SRC_DIR, r["original"])
        if not os.path.exists(old_path):
            continue

        new_name = r["new_name"]
        if r["original"] == new_name:
            skipped += 1
            continue

        base_name = new_name
        counter = 2
        while new_name in used_names or (os.path.exists(os.path.join(SRC_DIR, new_name)) and new_name != r["original"]):
            stem = os.path.splitext(base_name)[0]
            new_name = f"{stem} ({counter}).mp3"
            counter += 1
            conflicts += 1

        used_names.add(new_name)
        new_path = os.path.join(SRC_DIR, new_name)

        if dry_run:
            logger.info(f"  [DRY] {r['original'][:55]} → {new_name[:55]}")
            renamed += 1
        else:
            try:
                os.rename(old_path, new_path)
                renamed += 1
            except Exception as e:
                logger.warning(f"  [FAIL] {r['original']}: {e}")
                skipped += 1

    logger.info(f"Rename: {renamed} renamed, {skipped} skipped, {conflicts} collision fixes")
    return renamed


# ── Main ─────────────────────────────────────────────────────────

def _load_scan():
    if not os.path.exists(RESULT_FILE):
        logger.error("No scan results found. Run --scan or --scan-fast first.")
        return None
    with open(RESULT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser(description="Bachata Library Organizer")
    parser.add_argument("--scan", action="store_true", help="Scan (ID3 + AcoustID + filename)")
    parser.add_argument("--scan-fast", action="store_true", help="Scan (ID3 + filename only, fast)")
    parser.add_argument("--dedup", action="store_true", help="Remove duplicates")
    parser.add_argument("--dedup-dry", action="store_true", help="Preview duplicates")
    parser.add_argument("--artwork", action="store_true", help="Fetch & embed missing album art")
    parser.add_argument("--artwork-dry", action="store_true", help="Preview artwork targets")
    parser.add_argument("--rename", action="store_true", help="Rename files")
    parser.add_argument("--rename-dry", action="store_true", help="Preview renames")
    parser.add_argument("--all", action="store_true", help="Full pipeline: scan → dedup → artwork → rename")
    args = parser.parse_args()

    if args.all:
        logger.info("=" * 50)
        logger.info("  FULL PIPELINE: scan → dedup → artwork → rename")
        logger.info("=" * 50)

        # 1. Scan
        logger.info("\n[1/4] Scanning...")
        results = scan_all(use_acoustid=False)

        # 2. Dedup
        logger.info("\n[2/4] Removing duplicates...")
        removed = remove_duplicates(results)

        # 3. Re-scan after dedup (file list changed)
        if removed > 0:
            logger.info("\n[2.5/4] Re-scanning after dedup...")
            results = scan_all(use_acoustid=False)

        # 4. Artwork
        logger.info("\n[3/4] Fetching album art...")
        fetch_artwork(results)

        # 5. Rename
        logger.info("\n[4/4] Renaming files...")
        rename_files(results)

        logger.info("\n" + "=" * 50)
        logger.info("  DONE!")
        remaining = len([f for f in os.listdir(SRC_DIR) if f.lower().endswith('.mp3')])
        logger.info(f"  Total files: {remaining}")
        logger.info("=" * 50)

    elif args.scan or args.scan_fast:
        results = scan_all(use_acoustid=not args.scan_fast)
        dupes = find_duplicates(results)
        if dupes:
            logger.info(f"\nDuplicate preview (top 10):")
            for d in dupes[:10]:
                logger.info(f"  KEEP:   {d['keep'][:60]}")
                logger.info(f"  REMOVE: {d['remove'][:60]} (size diff: {d['size_diff_pct']}%)")
                logger.info("")

    elif args.dedup or args.dedup_dry:
        data = _load_scan()
        if not data:
            return
        if args.dedup_dry:
            dupes = find_duplicates(data["files"])
            for d in dupes:
                logger.info(f"  KEEP:   {d['keep']}")
                logger.info(f"  REMOVE: {d['remove']} (size diff: {d['size_diff_pct']}%)")
                logger.info("")
            logger.info(f"Total: {len(dupes)} files would be removed")
        else:
            remove_duplicates(data["files"])

    elif args.artwork or args.artwork_dry:
        data = _load_scan()
        if not data:
            return
        fetch_artwork(data["files"], dry_run=args.artwork_dry)

    elif args.rename or args.rename_dry:
        data = _load_scan()
        if not data:
            return
        rename_files(data["files"], dry_run=args.rename_dry)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
