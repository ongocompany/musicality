#!/bin/bash
# Supabase REST API backup — daily cron
# Dumps all public tables to JSON files on /mnt/nvme/backups/

set -e
source /home/jinwoo/musicality/server/.env

BACKUP_DIR="/mnt/nvme/backups/supabase"
DATE=$(date +%Y%m%d)
DEST="${BACKUP_DIR}/${DATE}"
mkdir -p "$DEST"

API="${SUPABASE_URL}/rest/v1"
AUTH="apikey: ${SUPABASE_SERVICE_KEY}"
ROLE="Authorization: Bearer ${SUPABASE_SERVICE_KEY}"

# Tables to backup
TABLES="analysis_cache profiles crews crew_members song_threads song_posts general_posts crew_events"

for TABLE in $TABLES; do
    echo "$(date +%H:%M:%S) Backing up ${TABLE}..."
    OFFSET=0
    PAGE=1000
    : > "${DEST}/${TABLE}.json.tmp"
    echo "[" >> "${DEST}/${TABLE}.json.tmp"
    FIRST=true

    while true; do
        DATA=$(curl -s "${API}/${TABLE}?select=*&offset=${OFFSET}&limit=${PAGE}" \
            -H "$AUTH" -H "$ROLE" -H "Accept: application/json")

        # Check if empty array or error
        if [ "$DATA" = "[]" ] || [ -z "$DATA" ]; then
            break
        fi

        # Strip [ ] and append
        INNER=$(echo "$DATA" | sed 's/^\[//;s/\]$//')
        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo "," >> "${DEST}/${TABLE}.json.tmp"
        fi
        echo "$INNER" >> "${DEST}/${TABLE}.json.tmp"

        COUNT=$(echo "$DATA" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
        OFFSET=$((OFFSET + PAGE))
        if [ "$COUNT" -lt "$PAGE" ]; then
            break
        fi
    done

    echo "]" >> "${DEST}/${TABLE}.json.tmp"
    mv "${DEST}/${TABLE}.json.tmp" "${DEST}/${TABLE}.json"
    SIZE=$(du -h "${DEST}/${TABLE}.json" | cut -f1)
    echo "  -> ${TABLE}.json (${SIZE})"
done

# Cleanup old backups (keep 7 days)
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;

echo "$(date +%H:%M:%S) Backup complete -> ${DEST}"
