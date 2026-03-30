#!/usr/bin/env python3
"""
Phase 2 v3: Find dancer's "1" by detecting the first mood change
in the model's downbeat activation pattern.

Key insight: In intros, the model outputs many low-confidence downbeat peaks
(it's confused). When the main body starts, peaks become fewer and higher
confidence. The TRANSITION point = where the music "changes mood" = dancer's 1.

No section classification needed. Just detect when the model's behavior changes.
"""
import numpy as np, torch, librosa, json, sqlite3, re, unicodedata
from pathlib import Path
from supabase import create_client

torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])
import beat_this.inference as bti
def _pl(cp, device='cpu'):
    return torch.load(cp, map_location=device, weights_only=False)
bti.load_checkpoint = _pl

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"
CHECKPOINT = "/mnt/nvme/finetune_v2_checkpoints/latin_beat_this_final.ckpt"

def norm(s):
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", s.lower())

def find_audio(title, amap):
    nt = norm(title)
    if not nt or len(nt) < 5: return None
    if nt in amap: return amap[nt]
    if len(nt) >= 8:
        for k, p in amap.items():
            if nt in k: return p
    for k, p in amap.items():
        if len(k) >= 10 and k in nt: return p
    if " - " in title:
        parts = title.split(" - ", 1)
        combo = norm(parts[0]) + norm(parts[1])
        if len(combo) >= 10:
            for k, p in amap.items():
                if combo in k or k in combo: return p
        sn = norm(parts[1])
        if len(sn) >= 6:
            m = [(k, p) for k, p in amap.items() if sn in k]
            if len(m) == 1: return m[0][1]
    return None


def find_mood_change(db_activation, fps=50.0, window_sec=2.0):
    """
    Find the first "mood change" in the model's downbeat activation.

    Computes two signals per window:
    - n_peaks: number of frames above threshold (model confusion)
    - peak_conf: mean confidence of those peaks (model certainty)

    A mood change = n_peaks drops AND/OR peak_conf jumps.
    If the first window already looks "confident", return 0 (no intro).

    Returns: timestamp of the first mood change (seconds), or 0.0 if none.
    """
    da = torch.sigmoid(db_activation).cpu().numpy().flatten()
    window = int(window_sec * fps)

    # Compute per-window stats
    stats = []
    for i in range(0, len(da) - window, window):
        t = i / fps
        chunk = da[i:i+window]
        peaks = chunk[chunk > 0.3]
        n_peaks = len(peaks)
        conf = float(np.mean(peaks)) if len(peaks) > 0 else 0.0
        stats.append((t, n_peaks, conf))

    if len(stats) < 3:
        return 0.0

    # First window baseline
    first_n = stats[0][1]
    first_conf = stats[0][2]

    # If first window already has few peaks and high confidence → no intro
    if first_n <= 8 and first_conf >= 0.6:
        return 0.0

    # Scan for transition: n_peaks drops below first_n * ratio OR conf jumps
    for i in range(1, len(stats)):
        t, n, c = stats[i]
        if t > 60:  # don't look beyond 60s for intro
            break

        # Transition detected when:
        # - peaks drop to less than 60% of initial AND conf rises
        # - OR conf jumps above 0.65 when first was below 0.55
        peak_drop = n <= first_n * 0.6
        conf_jump = c >= first_conf + 0.1 and c >= 0.6

        if peak_drop or conf_jump:
            return t

    return 0.0


def find_anchor_v3(beats, downbeats, db_activation, fps=50.0):
    """Find dancer's 1 using mood change detection."""
    change_time = find_mood_change(db_activation, fps)

    if change_time <= 0.1:
        # No mood change → use downbeats[0]
        return downbeats[0] if downbeats else 0.0, "no_intro"

    # Find nearest downbeat at or after mood change
    for db in downbeats:
        if db >= change_time - 0.5:
            return db, f"mood_change@{change_time:.1f}s"

    return downbeats[0] if downbeats else 0.0, "fallback"


def main():
    print("Loading...", flush=True)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint, title").eq("crew_id", CREW_ID).execute()
    tmap = {t["id"]: t for t in threads.data}
    pnotes = []
    for i in range(0, len(list(tmap.keys())), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", list(tmap.keys())[i:i+50]).execute()
        pnotes.extend(resp.data)

    adir = Path("/mnt/nvme/batch_analyze/done")
    amap = {norm(f.stem): f for f in adir.iterdir() if f.suffix.lower() in (".mp3",".wav",".m4a")}
    a2b = bti.Audio2Beats(checkpoint_path=CHECKPOINT, device="cuda:0")
    print(f"Ready! Pnotes: {len(pnotes)}", flush=True)

    p1_ok, p3_ok, total = 0, 0, 0
    p3_wrong = []
    decisions = {"no_intro": 0, "mood_change": 0, "fallback": 0}

    for pi, pn in enumerate(pnotes):
        t = tmap.get(pn["thread_id"])
        if not t or not t.get("fingerprint"): continue
        d = pn["phrase_note_data"]
        if not d or "phrases" not in d or "analysis" not in d: continue
        gb = d["analysis"]["beats"]
        bd = d["phrases"]["boundaries"]
        if len(gb) < 16 or len(bd) < 2 or bd[1] >= len(gb): continue
        gt = gb[bd[1]]
        iv = float(np.median(np.diff(gb[:20])))
        tol = iv * 2.5
        title = d.get("metadata",{}).get("title","") or t.get("title","")

        ap = find_audio(title, amap)
        if not ap: continue

        try:
            y, sr = librosa.load(str(ap), sr=22050, mono=True)
            spect = a2b.signal2spect(y, sr)
            beat_act, db_act = a2b.spect2frames(spect)
            fb, fd = a2b.frames2beats(beat_act, db_act)
            fb = list(fb); fd = list(fd)
        except:
            continue

        total += 1

        # Phase 1
        if abs((fd[0] if fd else 0) - gt) <= tol:
            p1_ok += 1

        # Phase 2 v3
        anchor, reason = find_anchor_v3(fb, fd, db_act)
        key = reason.split("@")[0]
        decisions[key] = decisions.get(key, 0) + 1

        if abs(anchor - gt) <= tol:
            p3_ok += 1
        else:
            p3_wrong.append({"t": title[:30], "gt": round(gt,2), "a": round(anchor,2),
                           "d": round(abs(anchor-gt),2), "i": bd[1], "r": reason})

        if (pi+1) % 30 == 0:
            print(f"  [{pi+1}] p1={p1_ok}/{total} ({p1_ok/total*100:.0f}%)  p3={p3_ok}/{total} ({p3_ok/total*100:.0f}%)", flush=True)

    print(f"\n{'='*60}", flush=True)
    print("PHASE 2 v3: MOOD CHANGE DETECTION", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"Phase 1 (downbeats[0]):     {p1_ok}/{total} = {p1_ok/total*100:.1f}%", flush=True)
    print(f"Phase 2 v3 (mood change):   {p3_ok}/{total} = {p3_ok/total*100:.1f}%", flush=True)
    print(f"Madmom baseline:            23/138 = 16.7%", flush=True)
    print(f"\nDecisions: {decisions}", flush=True)
    if total:
        print(f"Phase 1->v3 delta: {(p3_ok-p1_ok)/total*100:+.1f}%p", flush=True)
    print(f"\nWrong (worst 10):", flush=True)
    p3_wrong.sort(key=lambda x: x["d"], reverse=True)
    for r in p3_wrong[:10]:
        print(f"  {r['t']:30s} GT:{r['gt']:6.1f}s Anc:{r['a']:6.1f}s Diff:{r['d']:5.1f}s idx:{r['i']} [{r['r']}]", flush=True)


if __name__ == "__main__":
    main()
