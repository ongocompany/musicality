"""
cloud_tracks_dump.json → Supabase cloud_tracks via REST API.
jinserver에서 실행:
  cd ~/musicality/server && python scripts/migrate_cloud_mcp.py
"""

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')

import httpx

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_KEY']
DUMP_PATH = Path(__file__).resolve().parent / 'cloud_tracks_dump.json'
PROGRESS_FILE = Path(__file__).resolve().parent / 'cloud_migrate_progress.txt'
BATCH_SIZE = 5


def insert_batch(client, batch):
    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=ignore-duplicates',
    }
    payload = []
    for r in batch:
        payload.append({
            'fingerprint': r['fingerprint'],
            'file_hash': r['file_hash'],
            'title': r['title'],
            'artist': r['artist'],
            'album': r['album'],
            'album_art_url': r['album_art_url'],
            'duration': r['duration'],
            'bpm': r['bpm'],
            'format': r['format'],
            'file_size': r['file_size'],
            'beats': r['beats'],
            'downbeats': r['downbeats'],
            'beats_per_bar': r['beats_per_bar'],
            'confidence': r['confidence'],
            'sections': r['sections'],
            'phrase_boundaries': r['phrase_boundaries'],
            'waveform_peaks': r['waveform_peaks'],
        })

    resp = client.post(
        f'{SUPABASE_URL}/rest/v1/cloud_tracks',
        headers=headers,
        json=payload,
    )
    return resp.status_code in (200, 201), resp.status_code, resp.text[:300] if resp.status_code not in (200, 201) else ''


def get_progress():
    if PROGRESS_FILE.exists():
        return int(PROGRESS_FILE.read_text().strip())
    return 0


def save_progress(n):
    PROGRESS_FILE.write_text(str(n))


def main():
    with open(DUMP_PATH) as f:
        records = json.load(f)
    print(f"Loaded {len(records)} records")

    start_from = get_progress()
    if start_from > 0:
        print(f"Resuming from index {start_from}")

    inserted = 0
    errors = 0

    with httpx.Client(timeout=30) as client:
        for i in range(start_from, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            ok, status, err = insert_batch(client, batch)

            if ok:
                inserted += len(batch)
            else:
                # Try one by one
                for r in batch:
                    ok1, s1, e1 = insert_batch(client, [r])
                    if ok1:
                        inserted += 1
                    else:
                        errors += 1
                        if errors <= 5:
                            print(f"  ERROR {s1}: {e1}")

            save_progress(i + len(batch))

            batch_num = (i - start_from) // BATCH_SIZE
            if batch_num % 200 == 0:
                print(f"  Progress: {i + len(batch)}/{len(records)} (inserted: {inserted}, errors: {errors})")

    print(f"\nDone! {inserted} inserted, {errors} errors (out of {len(records)})")


if __name__ == '__main__':
    main()
