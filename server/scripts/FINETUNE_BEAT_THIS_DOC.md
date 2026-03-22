# Beat This! Fine-tuning for Latin Dance Music

## Overview

Madmom의 정확도를 Beat This!의 속도(~4초)로 가져오기 위한 Knowledge Distillation 실험.
느리지만 정확한 Madmom(~47초) → 빠른 Beat This! 모델에 라틴 리듬 패턴을 학습시키는 접근.

## 실험 결과 (2026-03-22, v1)

### 조건
- 학습 데이터: **58곡** (Madmom confidence >= 0.9)
- Base model: Beat This! small0 (2.1M params, 8MB)
- Epochs: 30 (EarlyStopping patience=8 → epoch 0에서 조기 종료)
- LR: 0.0002, batch_size: 4, augmentation: 없음
- GPU: jinserver CUDA

### 결과 (Madmom을 ground truth로)

| Engine | Beat F-measure | Downbeat F-measure | Speed |
|--------|---------------|-------------------|-------|
| Original Beat This! | 0.838 | 0.697 | 3.9s |
| Finetuned Beat This! | 0.845 | 0.365 | 3.7s |
| Madmom (ground truth) | 1.000 | 1.000 | ~47s |

### 분석
- Beat 정확도: 미미한 개선 (+0.7%)
- Downbeat 정확도: 크게 하락 (-33%) — 데이터 부족 + 1 epoch만 학습
- 속도: 둘 다 ~4초 (Madmom 대비 10x 빠름)

### 한계 및 개선 방향
1. **데이터 부족**: 58곡 → 최소 500곡+ 필요 (batch 분석 완료 후 재시도)
2. **Augmentation 미적용**: pitch/tempo shift spectrogram 사전 생성 필요
3. **LR 조정**: 0.0002 → 0.00005 (overfitting 방지)
4. **인간 라벨링**: pnote 데이터 수집 후 2차 튜닝하면 Madmom보다 좋아질 가능성

## 파이프라인 구조

### 스크립트 (server/scripts/)

| 파일 | 용도 |
|------|------|
| `prepare_finetune_data.py` | Madmom cache DB → Beat This! 학습 데이터 (spectrogram + .beats) |
| `finetune_beat_this.py` | Beat This! small 모델 fine-tune (PyTorch Lightning) |
| `eval_finetune.py` | Original BT vs Finetuned BT vs Madmom 비교 평가 |

### 데이터 형식 (Beat This! 기대 구조)

```
finetune_data/
├── annotations/{dataset_name}/
│   ├── info.json                    # {"has_downbeats": true}
│   ├── single.split                 # "stem\ttrain" or "stem\tval"
│   └── annotations/beats/
│       └── {stem}.beats             # "0.340\t4\n0.681\t1\n..."
└── audio/spectrograms/{dataset_name}/
    └── {stem}/track.npy             # mel spectrogram (T x 128)
```

### .beats 파일 포맷
```
시간(초)\t비트번호
0.340	4
0.681	1       ← 1 = downbeat
1.023	2
1.364	3
```

### Spectrogram 사양
- 128-bin mel spectrogram
- Sample rate: 22050Hz, hop_length: 441 (= 50 fps)
- Frequency: 30Hz ~ 11kHz
- Scaling: ln(1 + 1000 * x)

## jinserver 경로

| 항목 | 경로 |
|------|------|
| 학습 데이터 | `/mnt/nvme/finetune_data/` |
| 체크포인트 | `/mnt/nvme/finetune_checkpoints/` |
| Best model | `/mnt/nvme/finetune_checkpoints/latin_beat_this_final.ckpt` |
| 학습 로그 | `/mnt/nvme/finetune_log.txt` |
| Beat This! 패키지 | venv에 설치됨 (beat-this 0.1 + torch 2.10) |

## 재시도 조건

batch 분석이 1000곡+ 완료되면 (confidence >= 0.9):
1. `prepare_finetune_data.py` 재실행 (더 많은 done 파일 + DB 매칭)
2. `finetune_beat_this.py` 재실행 (augmentation 추가, lr 낮춤)
3. `eval_finetune.py`로 비교

## 주의사항

- PyTorch 2.6+에서 `torch.load` 기본값이 `weights_only=True`로 변경됨
  - numpy 타입 포함된 체크포인트 로드 시 에러 발생
  - `torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])` 필요
  - 또는 `weights_only=False`로 명시적 설정
- Beat This! 학습에는 피치/템포 augmentation 파일이 사전 생성되어야 함
  - augmentation 없이 학습 가능하지만 품질 저하
- `analyzer_engine` 필드가 cache DB에 추가됨 (2026-03-22)
  - 향후 엔진 전환 시 "beat_this_latin_ft_v1" 등으로 기록
