"""
analysis_cache (SQLite) → cloud_tracks (Supabase) 마이그레이션.

jinserver에서 실행:
  cd ~/musicality/server && python scripts/migrate_to_cloud_tracks.py

SQLite에서 읽어서 JSON으로 덤프 → 로컬에서 MCP execute_sql로 INSERT.
너무 크므로 소규모 배치로 처리.
"""

import sqlite3
import json
import sys
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / 'analysis_cache.db'
OUTPUT_PATH = Path(__file__).resolve().parent / 'cloud_tracks_dump.json'


def load_cache_rows():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    cur = conn.execute("""
        SELECT id, fingerprint, file_hash, file_size, duration, bpm,
               beats, downbeats, beats_per_bar, confidence,
               sections, phrase_boundaries, waveform_peaks,
               metadata
        FROM analysis_cache
        WHERE fingerprint IS NOT NULL AND fingerprint != ''
        ORDER BY created_at
    """)
    rows = cur.fetchall()
    conn.close()
    return rows


def parse_metadata(meta_str):
    if not meta_str:
        return {}
    try:
        meta = json.loads(meta_str)
        return {
            'title': meta.get('title', ''),
            'artist': meta.get('artist', ''),
            'album': meta.get('album', ''),
            'album_art_url': meta.get('album_art_url', ''),
        }
    except (json.JSONDecodeError, TypeError):
        return {}


def row_to_record(row):
    meta = parse_metadata(row['metadata'])
    row_id = row['id'] or row['fingerprint'][:8]
    title = meta.get('title', '') or f"Track-{row_id[:8]}"

    return {
        'fingerprint': row['fingerprint'],
        'file_hash': row['file_hash'],
        'title': title,
        'artist': meta.get('artist') or None,
        'album': meta.get('album') or None,
        'album_art_url': meta.get('album_art_url') or None,
        'duration': row['duration'],
        'bpm': row['bpm'],
        'format': 'mp3',
        'file_size': row['file_size'],
        'beats': json.loads(row['beats']) if row['beats'] else [],
        'downbeats': json.loads(row['downbeats']) if row['downbeats'] else [],
        'beats_per_bar': row['beats_per_bar'] or 4,
        'confidence': row['confidence'] or 0,
        'sections': json.loads(row['sections']) if row['sections'] else [],
        'phrase_boundaries': json.loads(row['phrase_boundaries']) if row['phrase_boundaries'] else [],
        'waveform_peaks': json.loads(row['waveform_peaks']) if row['waveform_peaks'] else [],
    }


def main():
    rows = load_cache_rows()
    print(f"Loaded {len(rows)} rows from analysis_cache")

    # Deduplicate by fingerprint
    seen_fp = set()
    records = []
    for row in rows:
        fp = row['fingerprint']
        if fp not in seen_fp:
            seen_fp.add(fp)
            records.append(row_to_record(row))
    print(f"Unique fingerprints: {len(records)}")

    # Dump to JSON for MCP-based insert
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(records, f, ensure_ascii=False)
    print(f"Dumped to {OUTPUT_PATH} ({OUTPUT_PATH.stat().st_size / 1024 / 1024:.1f} MB)")
    print("Use migrate_to_cloud_tracks_insert.py on MacBook to insert via Supabase.")


if __name__ == '__main__':
    main()
