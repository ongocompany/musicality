"""
metadata_lookup.py — AcoustID + MusicBrainz + Cover Art Archive
Chromaprint fingerprint -> AcoustID -> MusicBrainz recording -> album art
"""

import logging
import time
import requests

logger = logging.getLogger(__name__)

ACOUSTID_API_KEY = "PRFvjdfrM2"
ACOUSTID_URL = "https://api.acoustid.org/v2/lookup"
COVERART_URL = "https://coverartarchive.org/release"

# MusicBrainz requires a User-Agent header
MB_HEADERS = {
    "User-Agent": "Ritmo/1.0.0 (https://github.com/ongocompany/musicality)",
    "Accept": "application/json",
}

# Rate limit: MusicBrainz allows 1 req/sec
_last_mb_request = 0.0


def _mb_throttle():
    """Ensure at least 1 second between MusicBrainz API calls."""
    global _last_mb_request
    elapsed = time.time() - _last_mb_request
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _last_mb_request = time.time()


def lookup_metadata(fingerprint: str, duration: float) -> dict | None:
    """
    Look up track metadata using Chromaprint fingerprint.

    Returns dict with keys: title, artist, album, album_art_url, release_id
    or None if lookup fails / no match found.
    """
    if not fingerprint:
        return None

    try:
        # Step 1: AcoustID lookup (fingerprint -> recording IDs)
        recording = _acoustid_lookup(fingerprint, duration)
        if not recording:
            logger.info("[Metadata] AcoustID: no match found")
            return None

        result = {
            "title": recording.get("title"),
            "artist": None,
            "album": None,
            "album_art_url": None,
            "release_id": None,
        }

        # Extract artist from AcoustID response
        artists = recording.get("artists", [])
        if artists:
            result["artist"] = artists[0].get("name")

        # Extract release (album) from AcoustID response
        releases = recording.get("releasegroups", [])
        if releases:
            result["album"] = releases[0].get("title")

            # Get specific release ID for cover art
            release_list = releases[0].get("releases", [])
            if release_list:
                result["release_id"] = release_list[0].get("id")

        # Step 2: Cover Art Archive lookup
        if result["release_id"]:
            art_url = _coverart_lookup(result["release_id"])
            if art_url:
                result["album_art_url"] = art_url

        logger.info(
            f"[Metadata] Found: {result['artist']} - {result['title']} "
            f"(album: {result['album']}, art: {'yes' if result['album_art_url'] else 'no'})"
        )
        return result

    except Exception as e:
        logger.warning(f"[Metadata] Lookup failed: {e}")
        return None


def _acoustid_lookup(fingerprint: str, duration: float) -> dict | None:
    """Query AcoustID API with fingerprint and duration (POST to avoid URL length limits)."""
    payload = {
        "client": ACOUSTID_API_KEY,
        "fingerprint": fingerprint,
        "duration": int(duration),
        "meta": "recordings+releasegroups+compress",
    }

    resp = requests.post(ACOUSTID_URL, data=payload, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    if data.get("status") != "ok":
        logger.warning(f"[AcoustID] API error: {data}")
        return None

    results = data.get("results", [])
    if not results:
        return None

    # Pick best match (highest score)
    best = max(results, key=lambda r: r.get("score", 0))
    score = best.get("score", 0)

    if score < 0.5:
        logger.info(f"[AcoustID] Best score too low: {score:.2f}")
        return None

    recordings = best.get("recordings", [])
    if not recordings:
        return None

    # Return first recording with the most metadata
    return recordings[0]


def _coverart_lookup(release_id: str) -> str | None:
    """Get album art URL from Cover Art Archive."""
    try:
        _mb_throttle()
        # CAA redirects to actual image URL; we want the front cover
        url = f"{COVERART_URL}/{release_id}"
        resp = requests.get(url, headers=MB_HEADERS, timeout=10)

        if resp.status_code == 404:
            return None

        resp.raise_for_status()
        data = resp.json()

        images = data.get("images", [])
        # Prefer front cover
        for img in images:
            if img.get("front"):
                # Use 250px thumbnail for mobile
                thumbnails = img.get("thumbnails", {})
                return (
                    thumbnails.get("250")
                    or thumbnails.get("small")
                    or img.get("image")
                )

        # Fallback to first image
        if images:
            thumbnails = images[0].get("thumbnails", {})
            return (
                thumbnails.get("250")
                or thumbnails.get("small")
                or images[0].get("image")
            )

        return None

    except Exception as e:
        logger.debug(f"[CoverArt] Lookup failed for {release_id}: {e}")
        return None
