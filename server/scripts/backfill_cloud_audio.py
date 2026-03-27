"""
기존 MP3 파일들을 cloud_tracks와 fingerprint 매칭하여 storage_path 연결.
매칭된 파일은 192kbps로 변환하여 /mnt/nvme/cloud_audio/에 저장.

jinserver에서 실행:
  cd ~/musicality/server && source venv/bin/activate && python scripts/backfill_cloud_audio.py
"""

import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_KEY']
CLOUD_AUDIO_DIR = Path("/mnt/nvme/cloud_audio")
MP3_DIRS = [
    "/mnt/nvme/batch_analyze/done",
    "/mnt/nvme/batch_analyze/pending",
    "/mnt/nvme/batch_analyze/rejected",
    "/home/jinwoo/musicality/server/uploads",
]
PROGRESS_FILE = Path(__file__).resolve().parent / 'backfill_audio_progress.json'

headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
}


def get_storage_path(fingerprint: str) -> Path:
    fp_hash = hashlib.md5(fingerprint.encode()).hexdigest()
    return CLOUD_AUDIO_DIR / fp_hash[:2] / f"{fp_hash}.mp3"


def convert_192kbps(src: str, dst: Path) -> bool:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        return True
    try:
        result = subprocess.run(
            ["ffmpeg", "-y", "-i", src, "-b:a", "192k",
             "-map_metadata", "0", "-id3v2_version", "3", str(dst)],
            capture_output=True, text=True, timeout=60,
        )
        return result.returncode == 0
    except Exception as e:
        logger.error(f"ffmpeg failed: {e}")
        return False


def compute_fingerprint(file_path: str):
    try:
        import acoustid
        duration, fp_encoded = acoustid.fingerprint_file(file_path)
        fp_str = fp_encoded.decode("utf-8") if isinstance(fp_encoded, bytes) else str(fp_encoded)
        return duration, fp_str
    except Exception as e:
        logger.debug(f"Fingerprint failed for {file_path}: {e}")
        return None, None


def load_progress():
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"done": []}


def save_progress(progress):
    PROGRESS_FILE.write_text(json.dumps(progress))


def main():
    # 1. cloud_tracks에서 storage_path가 없는 곡 목록
    logger.info("Fetching cloud_tracks without storage_path...")
    with httpx.Client(timeout=30) as client:
        resp = client.get(
            f'{SUPABASE_URL}/rest/v1/cloud_tracks?storage_path=is.null&select=id,fingerprint,fp_hash,duration',
            headers=headers,
        )
        if resp.status_code != 200:
            logger.error(f"Failed to fetch: {resp.status_code}")
            return
        tracks = resp.json()

    logger.info(f"Cloud tracks without audio: {len(tracks)}")
    if not tracks:
        logger.info("Nothing to do!")
        return

    # fp_hash → track info map
    track_by_fp_hash = {}
    for t in tracks:
        track_by_fp_hash[t['fp_hash']] = t

    # 2. 모든 MP3 파일 수집
    mp3_files = []
    for d in MP3_DIRS:
        p = Path(d)
        if p.exists():
            mp3_files.extend(p.glob("*.mp3"))
    logger.info(f"MP3 files found: {len(mp3_files)}")

    progress = load_progress()
    done_set = set(progress["done"])

    matched = 0
    skipped = 0
    errors = 0

    for i, mp3 in enumerate(mp3_files):
        if str(mp3) in done_set:
            skipped += 1
            continue

        # Fingerprint
        duration, fp_str = compute_fingerprint(str(mp3))
        if not fp_str:
            done_set.add(str(mp3))
            continue

        fp_hash = hashlib.md5(fp_str.encode()).hexdigest()

        if fp_hash not in track_by_fp_hash:
            done_set.add(str(mp3))
            continue

        # Match found!
        track = track_by_fp_hash[fp_hash]
        dst = get_storage_path(fp_str)

        if not dst.exists():
            ok = convert_192kbps(str(mp3), dst)
            if not ok:
                errors += 1
                done_set.add(str(mp3))
                continue

        # Update storage_path in Supabase
        with httpx.Client(timeout=10) as client:
            resp = client.patch(
                f'{SUPABASE_URL}/rest/v1/cloud_tracks?id=eq.{track["id"]}',
                headers=headers,
                json={
                    "storage_path": str(dst),
                    "file_size": dst.stat().st_size,
                },
            )

        matched += 1
        done_set.add(str(mp3))
        del track_by_fp_hash[fp_hash]  # Don't match again

        if matched % 100 == 0:
            logger.info(f"Progress: {matched} matched, {i+1}/{len(mp3_files)} scanned")
            progress["done"] = list(done_set)
            save_progress(progress)

    progress["done"] = list(done_set)
    save_progress(progress)

    logger.info(f"\nDone! Matched: {matched}, Errors: {errors}, Skipped: {skipped}")
    logger.info(f"Remaining without audio: {len(track_by_fp_hash)}")


if __name__ == '__main__':
    main()
