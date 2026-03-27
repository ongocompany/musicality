"""
cloud_tracks_dump.json → Supabase cloud_tracks INSERT.
MacBook에서 실행 (MCP 대신 psycopg2 직접 접속).

사용법:
  python3 server/scripts/migrate_cloud_insert.py --db-url "postgresql://postgres:PASSWORD@db.gcrlzzbyxclswryauuwz.supabase.co:5432/postgres"

또는 Supabase pooler:
  python3 server/scripts/migrate_cloud_insert.py --db-url "postgresql://postgres.gcrlzzbyxclswryauuwz:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
"""

import json
import sys
import argparse
from pathlib import Path
import psycopg2
from psycopg2.extras import execute_values

DUMP_PATH = str(Path(__file__).resolve().parent / 'cloud_tracks_dump.json')
BATCH_SIZE = 50


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db-url', required=True, help='PostgreSQL connection URL')
    args = parser.parse_args()

    with open(DUMP_PATH) as f:
        records = json.load(f)
    print(f"Loaded {len(records)} records")

    conn = psycopg2.connect(args.db_url)
    cur = conn.cursor()

    sql = """
    INSERT INTO cloud_tracks (
        fingerprint, file_hash, title, artist, album,
        album_art_url, duration, bpm, format, file_size,
        beats, downbeats, beats_per_bar, confidence,
        sections, phrase_boundaries, waveform_peaks, upload_count
    ) VALUES %s
    ON CONFLICT ((md5(fingerprint))) DO NOTHING
    """

    total = 0
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        values = []
        for r in batch:
            values.append((
                r['fingerprint'], r['file_hash'], r['title'], r['artist'], r['album'],
                r['album_art_url'], r['duration'], r['bpm'], r['format'], r['file_size'],
                json.dumps(r['beats']), json.dumps(r['downbeats']),
                r['beats_per_bar'], r['confidence'],
                json.dumps(r['sections']), json.dumps(r['phrase_boundaries']),
                json.dumps(r['waveform_peaks']), 0,
            ))
        try:
            execute_values(cur, sql, values, page_size=BATCH_SIZE)
            conn.commit()
            total += len(batch)
            if (i // BATCH_SIZE) % 20 == 0:
                print(f"  Inserted {total}/{len(records)}...")
        except Exception as e:
            conn.rollback()
            print(f"  ERROR at batch {i // BATCH_SIZE}: {e}")
            # Try one-by-one
            for v in values:
                try:
                    cur.execute("""
                        INSERT INTO cloud_tracks (
                            fingerprint, file_hash, title, artist, album,
                            album_art_url, duration, bpm, format, file_size,
                            beats, downbeats, beats_per_bar, confidence,
                            sections, phrase_boundaries, waveform_peaks, upload_count
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        ON CONFLICT ((md5(fingerprint))) DO NOTHING
                    """, v)
                    conn.commit()
                    total += 1
                except Exception as e2:
                    conn.rollback()
                    print(f"    Skip: {e2}")

    cur.close()
    conn.close()
    print(f"\nDone! {total} cloud_tracks inserted.")


if __name__ == '__main__':
    main()
