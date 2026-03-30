#!/usr/bin/env python3
"""Evaluate finetuned Beat This! v2 vs Madmom baseline against pnote GT."""
import numpy as np, torch, librosa, json, sqlite3, re, unicodedata
from pathlib import Path
from supabase import create_client

torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])
import beat_this.inference as bti
def _patched_load(cp, device='cpu'):
    return torch.load(cp, map_location=device, weights_only=False)
bti.load_checkpoint = _patched_load

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"
CHECKPOINT = "/mnt/nvme/finetune_v2_checkpoints/latin_beat_this_final.ckpt"
CACHE_DB = "/home/jinwoo/musicality/server/analysis_cache.db"

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

def main():
    print("Loading pnotes...", flush=True)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint, title").eq("crew_id", CREW_ID).execute()
    tmap = {t["id"]: t for t in threads.data}
    pnotes = []
    for i in range(0, len(list(tmap.keys())), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", list(tmap.keys())[i:i+50]).execute()
        pnotes.extend(resp.data)

    adir = Path("/mnt/nvme/batch_analyze/done")
    amap = {norm(f.stem): f for f in adir.iterdir() if f.suffix.lower() in (".mp3",".wav",".m4a")}
    print(f"Audio: {len(amap)}, Pnotes: {len(pnotes)}", flush=True)

    print("Loading finetuned model...", flush=True)
    a2b = bti.Audio2Beats(checkpoint_path=CHECKPOINT, device="cuda:0")
    print("Model loaded!", flush=True)

    conn = sqlite3.connect(CACHE_DB)
    ft_ok, ft_n, mm_ok, mm_n = 0, 0, 0, 0
    ft_wrong = []

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
        fp = t["fingerprint"]

        # Finetuned inference
        ap = find_audio(title, amap)
        if ap:
            try:
                y, sr = librosa.load(str(ap), sr=22050, mono=True)
                fb, fd = a2b(y, sr)
                fb = list(fb); fd = list(fd)
                fr = fd[0] if fd else (fb[0] if fb else 0)
                diff = abs(fr - gt)
                ft_n += 1
                if diff <= tol:
                    ft_ok += 1
                else:
                    ft_wrong.append({"t":title[:30],"gt":round(gt,2),"ft":round(fr,2),"d":round(diff,2),"i":bd[1]})
                if (pi+1) % 20 == 0:
                    print(f"  [{pi+1}/{len(pnotes)}] ft={ft_ok}/{ft_n} ({ft_ok/ft_n*100:.0f}%)", flush=True)
            except Exception as e:
                print(f"  Error: {title[:30]} — {e}", flush=True)

        # Madmom baseline
        row = conn.execute("SELECT beats,downbeats,sections FROM analysis_cache WHERE fingerprint LIKE ? LIMIT 1",(fp[:64]+"%",)).fetchone()
        if row:
            eb, ed, es = json.loads(row[0]), json.loads(row[1]), json.loads(row[2])
            if len(eb) < 10: continue
            mr = None
            if isinstance(es,list):
                for s in es:
                    if isinstance(s,dict) and s.get("label")=="derecho":
                        mr = s.get("start_time",0); break
            if mr is None: mr = ed[0] if ed else eb[0]
            mm_n += 1
            if abs(mr - gt) <= tol: mm_ok += 1

    conn.close()
    print("\n" + "="*60, flush=True)
    print("EVALUATION: Finetuned BT v2 vs Madmom Baseline", flush=True)
    print("="*60, flush=True)
    print(f"\nFinetuned BT v2: {ft_ok}/{ft_n} = {ft_ok/ft_n*100:.1f}%" if ft_n else "N/A", flush=True)
    print(f"Madmom baseline: {mm_ok}/{mm_n} = {mm_ok/mm_n*100:.1f}%" if mm_n else "N/A", flush=True)
    if ft_n and mm_n:
        print(f"Delta: {ft_ok/ft_n*100 - mm_ok/mm_n*100:+.1f}%p", flush=True)
    print(f"\nWrong (worst 15):", flush=True)
    ft_wrong.sort(key=lambda x: x["d"], reverse=True)
    for r in ft_wrong[:15]:
        print(f"  {r['t']:30s} GT:{r['gt']:6.1f}s FT:{r['ft']:6.1f}s Diff:{r['d']:5.1f}s idx:{r['i']}", flush=True)

if __name__ == "__main__":
    main()
