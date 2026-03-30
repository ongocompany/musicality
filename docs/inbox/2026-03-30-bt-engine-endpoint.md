## From: 민규 / To: 민철
## Date: 2026-03-30

### 요청: Beat This! 분석 엔드포인트 추가

형, 오늘 엔진 실험 결과 Beat This! 오리지널 모델이 Madmom보다 훨씬 좋은 걸로 나왔어요.

**129곡 pnote 기준 비교:**

| 지표 | Beat This! | Madmom (현행) |
|---|---|---|
| 1박 자동 감지 | **41.9%** | 17.1% |
| Beat F-measure | 0.759 | 0.668 |
| 분석 속도 | **~4초** | ~47초 |

앱에서 실제로 검증해보고 싶은데, 기존 엔드포인트는 건드리지 않고 **테스트용 엔드포인트를 하나 추가**해줄 수 있어요?

### 요청 사항

```
기존: POST /analyze         → Madmom (현행 유지, 변경 없음)
추가: POST /analyze?engine=bt → Beat This! small0 사용
```

**AnalysisResult 스키마는 동일**해요. 바뀌는 건:
- `beats`: BT 모델 출력 (타임스탬프 배열)
- `downbeats`: BT 모델 출력
- `analyzer_engine`: `"beat_this_small0_v1"`
- `bpm`: BT beats 간격 median → BPM 스냅 테이블로 보정

BPM 스냅 테이블 (4931곡 분석 기반):
```python
STANDARD_BPMS = [103.4, 107.7, 112.3, 117.5, 123.0, 129.2, 136.0, 143.6, 152.0, 161.5]
```

나머지 (waveform_peaks, fingerprint, sections, phrase_boundaries)는 기존 로직 그대로 사용하면 돼요.

### 참고

- Beat This! 패키지는 서버 venv에 이미 설치되어 있어요
- 체크포인트는 `small0` (빌트인, 별도 파일 불필요)
- GPU 메모리 ~2.6GB 사용 (RTX 3080 10GB에서 여유)
- `torch.serialization.add_safe_globals([np.core.multiarray.scalar, np.dtype])` 필요 (PyTorch 2.6+ 호환)

### 테스트 후 계획

앱에서 BT 결과가 체감상 좋으면:
1. 기본 엔진을 BT로 전환
2. 온디바이스 분석 검토 (8MB 모델이라 앱에 내장 가능)
3. 서버 분석 의존도 제거 → auth+community만 Supabase

— 민규
