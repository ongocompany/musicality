#!/usr/bin/env python3
"""Check raw downbeat activation probabilities to find intro/body boundary."""
import numpy as np, torch, librosa, glob
torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])
import beat_this.inference as bti
def _pl(cp, device='cpu'):
    return torch.load(cp, map_location=device, weights_only=False)
bti.load_checkpoint = _pl

CHECKPOINT = "/mnt/nvme/finetune_v2_checkpoints/latin_beat_this_final.ckpt"
a2b = bti.Audio2Beats(checkpoint_path=CHECKPOINT, device="cuda:0")
print("Model loaded!", flush=True)

songs = [
    ("/mnt/nvme/batch_analyze/done/Chris Paradise - Ropa Interior (Bachata).mp3", "ROPA INTERIOR", 17.5),
    (None, "Traicionera", 2.0),
    (None, "100%", 0.5),
]

for path, title, gt in songs:
    if path is None:
        m = glob.glob(f"/mnt/nvme/batch_analyze/done/*{title}*")
        if not m:
            print(f"SKIP {title}")
            continue
        path = m[0]

    try:
        y, sr = librosa.load(path, sr=22050, mono=True)
    except Exception as e:
        print(f"SKIP {title}: {e}")
        continue

    spect = a2b.signal2spect(y, sr)
    beat_act, db_act = a2b.spect2frames(spect)

    # Sigmoid -> probabilities
    ba = torch.sigmoid(beat_act).cpu().numpy().flatten()
    da = torch.sigmoid(db_act).cpu().numpy().flatten()
    fps = 50.0

    print(f"\n=== {title} (GT 1st beat: {gt}s) ===", flush=True)
    print(f"  Time   B_peaks  D_peaks  D_peak_conf  Visualization", flush=True)

    window = int(2.0 * fps)
    for i in range(0, min(len(da), int(40 * fps)), window):
        t = i / fps
        b_chunk = ba[i:i+window]
        d_chunk = da[i:i+window]

        b_peaks = b_chunk[b_chunk > 0.5]
        d_peaks = d_chunk[d_chunk > 0.3]

        b_count = len(b_peaks)
        d_count = len(d_peaks)
        d_avg = float(np.mean(d_peaks)) if len(d_peaks) > 0 else 0.0

        bar = "#" * int(40 * d_avg)
        marker = " <<< GT" if abs(t - gt) < 2 else ""
        print(f"  {t:5.1f}s  B:{b_count:3d}  D:{d_count:3d}  conf:{d_avg:.3f}  [{bar:40s}]{marker}", flush=True)
