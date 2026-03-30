# 환경 & 기술 스택

## 분석 엔진 (Python, FastAPI)

| 라이브러리 | 용도 | 한계 |
|---|---|---|
| **Madmom** 0.16.1 | Beat/Downbeat RNN + Viterbi DBN | 느림(~47s), 바차타 다운비트 부정확 |
| **Librosa** 0.10.0 | BPM 추정, HPSS, 스펙트럼 특성 | 구조 분석 구식 (recall 16%→40%) |
| **SciPy** | 신호 처리 (median_filter, spectrogram) | - |
| **Chromaprint** | 오디오 핑거프린팅 + AcoustID | - |

## ML 실험 인프라

| 도구 | 용도 |
|---|---|
| **Beat This!** small0 | 파인튜닝 베이스 모델 (2.1M params, ~4s) |
| **PyTorch Lightning** | 학습 프레임워크 |
| **jinserver CUDA** | GPU 학습 환경 |

## 서버 인프라

- **jinserver** (Ubuntu): API 서버 (uvicorn:3900) + 배치 분석 + GPU 학습
- **Mac Mini** (M4 24GB): 보조 분석 워커
- **Storage**: /mnt/nvme/batch_analyze/ (pending/done/rejected)
- **DB**: SQLite analysis_cache.db (3-tier 캐시: hash → fingerprint → 분석)

## 핵심 파일 (원본 위치: ../server/)

| 파일 | 역할 | 우선순위 |
|---|---|---|
| `services/beat_analyzer.py` | 비트/다운비트 검출 (Madmom RNN+DBN) | ★★★ 최우선 개선 대상 |
| `services/structure_analyzer.py` | 음악 구조 분석 (SSM+클러스터링) v2.3 | ★★★ 최우선 개선 대상 |
| `services/analysis_cache.py` | 3-tier 캐시 (SQLite+fingerprint+hash) | ★★ 유지 |
| `services/metadata_lookup.py` | AcoustID/MusicBrainz 메타데이터 | ★ 유지 |
| `models/schemas.py` | AnalysisResult Pydantic 스키마 | ★★★ 인터페이스 계약 |
| `scripts/batch_pipeline.py` | YouTube→다운로드→분석 3단계 파이프라인 | ★★ 데이터 수집 |
| `scripts/finetune_beat_this.py` | Beat This! Knowledge Distillation | ★★★ 핵심 실험 |
| `scripts/eval_finetune.py` | 모델 비교 벤치마크 | ★★★ 평가 |
