# Beat This! Fine-tuning v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnote 154곡 사람 라벨 + augmentation으로 Beat This! 모델을 바차타 특화 파인튜닝하여, 1박 자동 감지 정확도를 16% → 60%+ 달성

**Architecture:** 2단계 전략 — (1) Beat This! 다운비트 파인튜닝 (pnote GT + augmentation), (2) 위상 충돌 분석 후처리 (링크/프래그먼트 감지). Phase 1만 이 문서에서 다룸.

**Tech Stack:** Python 3.11, PyTorch 2.10, PyTorch Lightning, Beat This! 0.1, Supabase (pnote 소스), jinserver CUDA GPU

**Baseline (2026-03-30):** 1박 16.1%, 프레이즈 F1 19.6% (137곡 pnote 평가)

---

## v1 실패 원인 & v2 변경점

| 항목 | v1 (실패) | v2 (이번) |
|---|---|---|
| Ground Truth | Madmom (라틴에 부정확) | **pnote 사람 라벨** |
| 데이터 수 | 58곡 | **154곡 + augmentation** |
| Augmentation | 없음 | **pitch shift ±2 semi, tempo ±5%** |
| LR | 0.0002 | **0.00005** |
| EarlyStopping | patience=8 (epoch 0 종료) | **patience=15, min_delta=0.001** |
| Validation | 없음 (동일 데이터) | **20% holdout (30곡)** |
| 앵커 전략 | derecho 기준 | **맘보 > 브레이크 > derecho 기준 (후처리)** |

## 핵심 참조 문서

- 라벨러 피드백 (앵커/블록/링크): `ritmo-engine/docs/labeler_feedback.md`
- Beat This! v1 실험 기록: `docs/engine/FINETUNE_BEAT_THIS_DOC.md`
- 기존 스크립트: `server/scripts/prepare_finetune_data.py`, `finetune_beat_this.py`, `eval_finetune.py`
- pnote 소스: Supabase `thread_phrase_notes` 테이블 (tela crew)
- 논문: Maia et al. 2022 (라틴 소량 파인튜닝), Gagnere 2024 (Few-shot SSL)

## 파일 구조

```
ritmo-engine/
├── scripts/
│   ├── prepare_pnote_labels.py    # NEW: pnote → .beats 라벨 변환
│   ├── generate_spectrograms.py   # NEW: 오디오 → mel spectrogram
│   ├── augment_data.py            # NEW: pitch/tempo augmentation
│   └── eval_v2.py                 # NEW: pnote GT 기반 평가 (기존 eval 대체)
├── experiments/
│   └── v2_finetune/               # 실험 결과 저장
└── docs/
    └── FINETUNE_V2_PLAN.md        # 이 문서
```

서버 경로:
```
jinserver:/mnt/nvme/
├── finetune_v2/                   # 학습 데이터 루트
│   ├── annotations/latin_pnote/
│   │   ├── info.json
│   │   ├── single.split
│   │   └── annotations/beats/*.beats
│   └── audio/spectrograms/latin_pnote/
│       └── {stem}/track.npy
├── finetune_v2_aug/               # augmented 데이터
└── finetune_v2_checkpoints/       # 체크포인트
```

---

## Task 1: pnote에서 .beats 라벨 추출

**Files:**
- Create: `ritmo-engine/scripts/prepare_pnote_labels.py`
- Output: `jinserver:/mnt/nvme/finetune_v2/annotations/latin_pnote/`

### pnote → .beats 변환 로직

pnote의 `phrases.boundaries[1]`이 댄서 기준 첫 1박.
이 비트 인덱스에서 8박 단위로 역산/전진하여 다운비트 위치를 결정:

```
예) beats = [0.33, 0.85, 1.40, ...], boundaries[1] = 3
→ beat index 3 (= 1.97초)이 첫 1박
→ index 3, 7, 11, 15, ... 가 다운비트 (beat_position=1)
→ index 4=2, 5=3, 6=4, 7=1, 8=2, ...
→ index 0~2는 인트로 자투리: 역산으로 beat_position 부여
```

.beats 파일 포맷:
```
0.330	2      ← 역산: (3-0) mod 4 = 3 → position 4-3+1=2? 아래 코드 참조
0.850	3
1.400	4
1.970	1      ← boundaries[1] = 첫 다운비트
2.500	2
3.070	3
3.630	4
4.160	1      ← 다음 다운비트
...
```

- [ ] **Step 1: 스크립트 작성**

```python
#!/usr/bin/env python3
"""
Extract .beats labels from pnote human annotations.

Key difference from v1: uses pnote phrases.boundaries[1] as the true
first downbeat, NOT Madmom's downbeat output. This is the "dancer's 1"
— the point where actual dancing begins after intro.

Usage:
    python scripts/prepare_pnote_labels.py \
        --output-dir /mnt/nvme/finetune_v2 \
        --val-ratio 0.2
"""
import argparse
import json
import logging
import random
from pathlib import Path

from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"
DATASET_NAME = "latin_pnote"


def fetch_pnotes():
    """Fetch all pnotes from tela crew."""
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint, title").eq("crew_id", CREW_ID).execute()
    thread_map = {t["id"]: t for t in threads.data}

    all_ids = list(thread_map.keys())
    pnotes = []
    for i in range(0, len(all_ids), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", all_ids[i:i+50]).execute()
        pnotes.extend(resp.data)

    result = []
    for pn in pnotes:
        tid = pn["thread_id"]
        thread = thread_map.get(tid)
        if not thread:
            continue
        data = pn["phrase_note_data"]
        if not data or "phrases" not in data or "analysis" not in data:
            continue
        result.append({
            "fingerprint": thread.get("fingerprint", ""),
            "title": data.get("metadata", {}).get("title", "Unknown"),
            "beats": data["analysis"]["beats"],
            "downbeats": data["analysis"]["downbeats"],
            "boundaries": data["phrases"]["boundaries"],
            "bpp": int(data["phrases"].get("beatsPerPhrase", 32)),
            "bpm": float(data["music"].get("bpm", 120)),
        })
    logger.info(f"Fetched {len(result)} pnotes")
    return result


def pnote_to_beats_annotation(pnote: dict) -> list[tuple[float, int]]:
    """
    Convert pnote to .beats annotation using dancer's first downbeat.

    The dancer's "1" is at phrases.boundaries[1] — the start of the
    second phrase (first phrase is intro/preparation).

    From that anchor, we assign beat_position 1-4 cycling forward,
    and reverse-calculate positions for beats before the anchor.
    """
    beats = pnote["beats"]
    boundaries = pnote["boundaries"]

    if len(beats) < 8 or len(boundaries) < 2:
        return []

    # Anchor: boundaries[1] is the first downbeat (dancer's "1")
    anchor_idx = boundaries[1]
    if anchor_idx >= len(beats):
        anchor_idx = 0

    beats_per_bar = 4  # bachata is always 4/4

    annotations = []
    for i, beat_time in enumerate(beats):
        # Calculate position relative to anchor
        offset = i - anchor_idx
        position = (offset % beats_per_bar) + 1  # 1, 2, 3, 4
        annotations.append((round(beat_time, 6), position))

    return annotations


def write_beats_file(annotations: list[tuple[float, int]], path: Path):
    """Write .beats file in Beat This! format."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        for time, pos in annotations:
            f.write(f"{time:.6f}\t{pos}\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--val-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    output = Path(args.output_dir)
    ann_dir = output / "annotations" / DATASET_NAME
    beats_dir = ann_dir / "annotations" / "beats"
    beats_dir.mkdir(parents=True, exist_ok=True)

    pnotes = fetch_pnotes()

    # Filter: need fingerprint and enough beats
    valid = [p for p in pnotes if p["fingerprint"] and len(p["beats"]) >= 16 and len(p["boundaries"]) >= 2]
    logger.info(f"Valid pnotes: {len(valid)}/{len(pnotes)}")

    # Shuffle and split
    random.shuffle(valid)
    n_val = max(1, int(len(valid) * args.val_ratio))
    val_set = valid[:n_val]
    train_set = valid[n_val:]
    logger.info(f"Train: {len(train_set)}, Val: {len(val_set)}")

    # Write annotations + split file
    split_lines = []
    stats = {"total": 0, "skipped": 0}

    for pnote in valid:
        # Use fingerprint prefix as stem (unique, filesystem-safe)
        stem = pnote["fingerprint"][:32]
        annotations = pnote_to_beats_annotation(pnote)
        if len(annotations) < 16:
            stats["skipped"] += 1
            continue

        write_beats_file(annotations, beats_dir / f"{stem}.beats")

        split = "val" if pnote in val_set else "train"
        split_lines.append(f"{stem}\t{split}")
        stats["total"] += 1

    # Write split file
    with open(ann_dir / "single.split", "w") as f:
        f.write("\n".join(split_lines) + "\n")

    # Write info.json
    with open(ann_dir / "info.json", "w") as f:
        json.dump({"has_downbeats": True}, f)

    logger.info(f"Done! {stats['total']} annotations written, {stats['skipped']} skipped")
    logger.info(f"Output: {ann_dir}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 서버에 복사 및 실행**

```bash
scp scripts/prepare_pnote_labels.py jinserver:/home/jinwoo/musicality/server/scripts/
ssh jinserver "/home/jinwoo/musicality/server/venv/bin/python3 \
    /home/jinwoo/musicality/server/scripts/prepare_pnote_labels.py \
    --output-dir /mnt/nvme/finetune_v2 \
    --val-ratio 0.2"
```

Expected: `~130 annotations written` (154 - invalid - 20% val)

- [ ] **Step 3: 검증 — .beats 파일 내용 확인**

```bash
ssh jinserver "head -20 /mnt/nvme/finetune_v2/annotations/latin_pnote/annotations/beats/*.beats | head -40"
ssh jinserver "wc -l /mnt/nvme/finetune_v2/annotations/latin_pnote/single.split"
ssh jinserver "cat /mnt/nvme/finetune_v2/annotations/latin_pnote/info.json"
```

Expected: .beats 파일에 `시간\t1~4` 형식, split 파일에 train/val 라벨

---

## Task 2: Spectrogram 생성

**Files:**
- Create: `ritmo-engine/scripts/generate_spectrograms.py`
- Output: `jinserver:/mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote/`

pnote의 fingerprint로 `batch_analyze/done/`에서 오디오 파일을 매칭하여 mel spectrogram 생성.

- [ ] **Step 1: 스크립트 작성**

```python
#!/usr/bin/env python3
"""
Generate mel spectrograms for Beat This! fine-tuning.

Matches pnote fingerprints to audio files in batch_analyze/done/
via the analysis_cache DB, then generates spectrograms using
Beat This!'s LogMelSpect transform.

Usage:
    python scripts/generate_spectrograms.py \
        --annotations-dir /mnt/nvme/finetune_v2/annotations/latin_pnote \
        --audio-dir /mnt/nvme/batch_analyze/done \
        --cache-db /home/jinwoo/musicality/server/analysis_cache.db \
        --output-dir /mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote
"""
import argparse
import hashlib
import json
import logging
import sqlite3
from pathlib import Path

import numpy as np
import torch
import torchaudio

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def load_stems(annotations_dir: Path) -> list[str]:
    """Load stem names from single.split file."""
    split_file = annotations_dir / "single.split"
    stems = []
    with open(split_file) as f:
        for line in f:
            parts = line.strip().split("\t")
            if parts:
                stems.append(parts[0])
    return stems


def find_audio_by_fingerprint(stem: str, cache_db: str, audio_dir: Path) -> Path | None:
    """
    Find audio file for a fingerprint-prefix stem.
    stem = first 32 chars of fingerprint.
    Look up cache DB for file_hash, then find in audio_dir.
    """
    conn = sqlite3.connect(cache_db)
    row = conn.execute(
        "SELECT file_hash FROM analysis_cache WHERE fingerprint LIKE ? LIMIT 1",
        (stem + "%",)
    ).fetchone()
    conn.close()

    if not row:
        return None

    file_hash = row[0]
    # Search audio files by hash
    for fp in audio_dir.iterdir():
        if fp.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".webm"):
            h = hashlib.sha256(fp.read_bytes()).hexdigest()
            if h == file_hash:
                return fp
    return None


def generate_spectrogram(audio_path: Path, output_dir: Path, stem: str):
    """Generate mel spectrogram matching Beat This! specs."""
    from beat_this.preprocessing import LogMelSpect

    spec_dir = output_dir / stem
    spec_dir.mkdir(parents=True, exist_ok=True)
    out_path = spec_dir / "track.npy"

    if out_path.exists():
        logger.info(f"  Skip (exists): {stem}")
        return True

    try:
        transform = LogMelSpect()
        waveform, sr = torchaudio.load(str(audio_path))
        # Resample to 22050 if needed
        if sr != 22050:
            waveform = torchaudio.functional.resample(waveform, sr, 22050)
        # Mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)
        spec = transform(waveform.squeeze(0))
        np.save(out_path, spec.numpy())
        return True
    except Exception as e:
        logger.warning(f"  Failed: {stem} — {e}")
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--annotations-dir", required=True)
    parser.add_argument("--audio-dir", required=True)
    parser.add_argument("--cache-db", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    ann_dir = Path(args.annotations_dir)
    audio_dir = Path(args.audio_dir)
    output_dir = Path(args.output_dir)

    stems = load_stems(ann_dir)
    logger.info(f"Loaded {len(stems)} stems")

    # Build hash map once (expensive but saves per-file hashing)
    logger.info("Building audio file hash map (this takes a while)...")
    hash_map = {}
    conn = sqlite3.connect(args.cache_db)
    for stem in stems:
        row = conn.execute(
            "SELECT file_hash FROM analysis_cache WHERE fingerprint LIKE ? LIMIT 1",
            (stem + "%",)
        ).fetchone()
        if row:
            hash_map[stem] = row[0]
    conn.close()

    # Reverse map: file_hash -> audio path
    logger.info("Scanning audio directory...")
    file_hash_to_path = {}
    needed_hashes = set(hash_map.values())
    for fp in audio_dir.iterdir():
        if fp.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg", ".webm"):
            h = hashlib.sha256(fp.read_bytes()).hexdigest()
            if h in needed_hashes:
                file_hash_to_path[h] = fp
                needed_hashes.discard(h)
                if not needed_hashes:
                    break

    logger.info(f"Matched {len(file_hash_to_path)}/{len(hash_map)} audio files")

    # Generate spectrograms
    success = 0
    for i, stem in enumerate(stems):
        file_hash = hash_map.get(stem)
        if not file_hash:
            continue
        audio_path = file_hash_to_path.get(file_hash)
        if not audio_path:
            continue
        logger.info(f"[{i+1}/{len(stems)}] {audio_path.name[:50]}")
        if generate_spectrogram(audio_path, output_dir, stem):
            success += 1

    logger.info(f"Done! {success}/{len(stems)} spectrograms generated")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 서버에 복사 및 실행**

```bash
scp scripts/generate_spectrograms.py jinserver:/home/jinwoo/musicality/server/scripts/
ssh jinserver "/home/jinwoo/musicality/server/venv/bin/python3 \
    /home/jinwoo/musicality/server/scripts/generate_spectrograms.py \
    --annotations-dir /mnt/nvme/finetune_v2/annotations/latin_pnote \
    --audio-dir /mnt/nvme/batch_analyze/done \
    --cache-db /home/jinwoo/musicality/server/analysis_cache.db \
    --output-dir /mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote"
```

Expected: `~120+ spectrograms generated` (5750곡 중 fingerprint 매칭된 것)
주의: 해시 계산이 오래 걸림 (~10-20분)

- [ ] **Step 3: 검증**

```bash
ssh jinserver "ls /mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote/ | wc -l"
ssh jinserver "ls /mnt/nvme/finetune_v2/audio/spectrograms/latin_pnote/ | head -5"
```

---

## Task 3: Fine-tuning 실행

**Files:**
- Modify: `server/scripts/finetune_beat_this.py` (LR, patience, warmup 변경)
- Output: `jinserver:/mnt/nvme/finetune_v2_checkpoints/`

- [ ] **Step 1: 파인튜닝 파라미터 설정 및 실행**

```bash
ssh jinserver "/home/jinwoo/musicality/server/venv/bin/python3 \
    /home/jinwoo/musicality/server/scripts/finetune_beat_this.py \
    --data-dir /mnt/nvme/finetune_v2 \
    --output-dir /mnt/nvme/finetune_v2_checkpoints \
    --base-model small0 \
    --epochs 50 \
    --batch-size 4 \
    --lr 0.00005 \
    --device cuda:0"
```

핵심 변경 (기존 스크립트 수정 필요):
- `--lr 0.00005` (v1의 0.0002 → 4배 낮춤)
- `EarlyStopping(patience=15, min_delta=0.001)` (v1은 patience=8)
- `warmup_steps=50` (v1은 100, 데이터 적으니 짧게)
- `--epochs 50` (patience가 조기종료하므로 여유 있게)

- [ ] **Step 2: 학습 로그 모니터링**

```bash
ssh jinserver "tail -f /mnt/nvme/finetune_v2_checkpoints/lightning_logs/version_0/metrics.csv"
```

overfitting 징후 확인:
- train_loss ↓ but val_loss ↑ → 즉시 중단
- val_beat_f1과 val_downbeat_f1 추이 관찰

- [ ] **Step 3: 베스트 체크포인트 확인**

```bash
ssh jinserver "ls -la /mnt/nvme/finetune_v2_checkpoints/*.ckpt"
```

---

## Task 4: 평가 (pnote GT 기반)

**Files:**
- Create: `ritmo-engine/scripts/eval_v2.py`

- [ ] **Step 1: 평가 스크립트 작성**

v1 평가와 동일 방식이지만, 파인튜닝된 모델로 154곡을 새로 분석하여 비교:

```python
#!/usr/bin/env python3
"""
Evaluate finetuned Beat This! vs original vs Madmom against pnote GT.

For each pnote song:
1. Run finetuned Beat This! inference → get beats/downbeats
2. Compare downbeats[0] against pnote boundaries[1] (dancer's "1")
3. Calculate accuracy metrics

Usage:
    python scripts/eval_v2.py \
        --checkpoint /mnt/nvme/finetune_v2_checkpoints/best.ckpt \
        --audio-dir /mnt/nvme/batch_analyze/done \
        --cache-db /home/jinwoo/musicality/server/analysis_cache.db
"""
import argparse
import hashlib
import json
import logging
import sqlite3
from pathlib import Path

import numpy as np
import torch
import torchaudio
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SUPABASE_URL = "https://gcrlzzbyxclswryauuwz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjcmx6emJ5eGNsc3dyeWF1dXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg3NjE0NiwiZXhwIjoyMDg5NDUyMTQ2fQ.1Q69Spqp8Xb9fKV-EE4XUAbybZ5FUYlAaJg62F1RRsQ"
CREW_ID = "7741b72f-0343-469f-9a03-844113e8d14a"


def run_inference(audio_path: Path, checkpoint_path: str) -> dict:
    """Run Beat This! inference on a single audio file."""
    from beat_this.inference import Audio2Beats

    a2b = Audio2Beats(checkpoint_path=checkpoint_path, device="cuda:0")
    beats, downbeats = a2b(str(audio_path))
    return {"beats": beats.tolist(), "downbeats": downbeats.tolist()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--audio-dir", required=True)
    parser.add_argument("--cache-db", required=True)
    args = parser.parse_args()

    # Fetch pnotes (same as prepare script)
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    threads = sb.table("song_threads").select("id, fingerprint").eq("crew_id", CREW_ID).execute()
    thread_map = {t["id"]: t for t in threads.data}
    all_ids = list(thread_map.keys())
    pnotes = []
    for i in range(0, len(all_ids), 50):
        resp = sb.table("thread_phrase_notes").select("thread_id, phrase_note_data").in_("thread_id", all_ids[i:i+50]).execute()
        pnotes.extend(resp.data)

    # Build fingerprint → audio path map via cache DB
    conn = sqlite3.connect(args.cache_db)
    audio_dir = Path(args.audio_dir)
    # ... (same matching logic as generate_spectrograms.py)

    correct = 0
    total = 0

    for pn in pnotes:
        data = pn["phrase_note_data"]
        if not data or len(data.get("analysis", {}).get("beats", [])) < 16:
            continue
        if len(data.get("phrases", {}).get("boundaries", [])) < 2:
            continue

        # Get GT
        gt_beats = data["analysis"]["beats"]
        gt_boundary1 = data["phrases"]["boundaries"][1]
        if gt_boundary1 >= len(gt_beats):
            continue
        gt_ref_time = gt_beats[gt_boundary1]

        # Run inference
        # ... (find audio, run model)
        # result = run_inference(audio_path, args.checkpoint)

        # Compare finetuned downbeats[0] vs GT
        # ft_ref = result["downbeats"][0] if result["downbeats"] else result["beats"][0]
        # diff = abs(ft_ref - gt_ref_time)
        # avg_iv = np.median(np.diff(result["beats"][:20]))
        # if diff <= avg_iv * 2.5:
        #     correct += 1
        # total += 1

    conn.close()
    # Print results comparison: Madmom baseline vs finetuned
    print(f"Finetuned: {correct}/{total} = {correct/total*100:.1f}%")
    print(f"Baseline (Madmom): 22/137 = 16.1%")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 평가 실행 및 결과 비교**

```bash
ssh jinserver "/home/jinwoo/musicality/server/venv/bin/python3 \
    /home/jinwoo/musicality/server/scripts/eval_v2.py \
    --checkpoint /mnt/nvme/finetune_v2_checkpoints/best.ckpt \
    --audio-dir /mnt/nvme/batch_analyze/done \
    --cache-db /home/jinwoo/musicality/server/analysis_cache.db"
```

### 성공 기준

| 지표 | Baseline (v1) | 목표 (v2) |
|---|---|---|
| 1박 자동 감지 | 16.1% | **40%+** (개선 확인) |
| Beat F-measure | 0.838 | **0.85+** (하락 없음) |
| Downbeat F-measure | 0.697 | **0.75+** (개선) |

40%+ 달성 시 → Phase 2 (위상 충돌 후처리) 진행으로 60%+ 목표
40% 미달 시 → augmentation 강화 or 데이터 추가 수집

---

## Task 5 (조건부): Augmentation

Task 3에서 overfitting이 보이거나 성능이 부족하면 실행.

- pitch shift: ±1, ±2 semitone (spectrogram 사전 생성)
- tempo shift: ±3%, ±5% (spectrogram + .beats 동시 조정)
- 154곡 × 5 augmentation = ~770곡 효과

```bash
# augmentation은 Beat This!의 내장 지원 확인 후 결정
# 사전 생성 필요 시 별도 스크립트 작성
```

---

## Phase 2 Preview (이 문서 범위 밖)

Phase 1의 다운비트가 개선되면, 후처리로 위상 충돌 분석 추가:

1. 파인튜닝된 모델의 downbeat 출력에서 **앵커 후보** 선정 (맘보 > 브레이크 > derecho)
2. 앵커 간 `offset mod 8` 계산 → 링크(브릿지 4박 / 프래그먼트 1~7박) 감지
3. 링크 경계에서 그리드 리셋 (양방향 위상 독립 정렬)
4. 참조: `ritmo-engine/docs/labeler_feedback.md` 섹션 3, 6
