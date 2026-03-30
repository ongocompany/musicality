# Ritmo Engine ↔ App 인터페이스 계약서

> 이 문서는 ritmo-engine(분석 서버)과 musicality-app(클라이언트) 사이의 API 계약을 정의한다.
> 양쪽 프로젝트 모두 이 문서를 참조하며, **스키마 변경 시 반드시 버전을 올린다.**

## API Version

- **Current**: `v1.0`
- **Engine Identifier**: `analyzer_engine` 필드로 구분 (예: `madmom_chunked_v1`, `beat_this_latin_ft_v1`)

---

## Endpoints

### `POST /analyze`
- **Input**: multipart/form-data (audio file: mp3, wav, flac, m4a, aac, ogg, mp4, mov)
- **Max Size**: 100MB
- **Responses**:
  - `200 OK` — 캐시 히트, body에 `AnalysisResult` 즉시 반환
  - `202 Accepted` — 비동기 처리 시작, `{job_id, status: "processing"}` 반환
  - `429 Too Many Requests` — 이미 분석 중, 기존 `{job_id}` 반환

### `GET /analyze/check/{file_hash}`
- **Input**: SHA-256 file hash (path parameter)
- **Responses**:
  - `200 OK` — 캐시 히트, `AnalysisResult` 반환
  - `404 Not Found` — 캐시 미스

### `GET /analyze/status/{job_id}`
- **Polling Interval**: 2초 권장
- **Responses**:
  - `{status: "processing"}` — 진행 중
  - `{status: "done", result: AnalysisResult}` — 완료
  - `{status: "error", error: "message"}` — 실패

### `GET /health`
- **Response**: `{status: "ok", version: "1.0.0"}`

---

## AnalysisResult Schema (v1.0)

```
{
  bpm: float                        # BPM (정수로 반올림하여 사용)
  beats: float[]                    # 비트 타임스탬프 (초 단위)
  downbeats: float[]                # 다운비트(1박) 타임스탬프 (초 단위)
  duration: float                   # 트랙 길이 (초)
  beats_per_bar: int                # 마디당 비트 수 (보통 4)
  confidence: float                 # 분석 신뢰도 (0.0~1.0)
  sections: SectionInfo[]           # 음악 구조 섹션 (기본값 [])
  phrase_boundaries: float[]        # 프레이즈 경계 타임스탬프 (초, 기본값 [])
  waveform_peaks: float[]           # 파형 피크 200개 (0.0~1.0, 시각화용)
  fingerprint: string               # Chromaprint 오디오 핑거프린트
  cached: bool                      # 캐시에서 온 결과인지
  file_hash: string                 # SHA-256 파일 해시
  metadata: TrackMetadata | null    # 자동 태깅 메타데이터
  unstable_regions: UnstableRegion[] # 불안정 구간 (앱에서 dim 처리)
  analyzer_engine: string           # 엔진 식별자
}
```

### SectionInfo
```
{
  label: "intro" | "derecho" | "majao" | "mambo" | "bridge" | "outro"
  start_time: float
  end_time: float
  confidence: float                 # 0.0~1.0
}
```

### TrackMetadata
```
{
  title: string | null
  artist: string | null
  album: string | null
  album_art_url: string | null      # Cover Art Archive 250px
  release_id: string | null         # MusicBrainz release ID
}
```

### UnstableRegion
```
{
  start_time: float
  end_time: float
  start_beat_index: int
  end_beat_index: int               # exclusive
  original_beats: float[]           # 원본 불규칙 비트 (참조용)
}
```

---

## 앱 쪽 사용 패턴 (민규 참조용)

| 서버 필드 (snake_case) | 앱 필드 (camelCase) | 사용 위치 | 용도 |
|---|---|---|---|
| `beats` | `beats` | beatCounter.ts, playerStore | 비트 카운팅 (1~8), 그리드 표시 |
| `downbeats` | `downbeats` | beatCounter.ts | 다운비트 기준점 (사용자 오프셋 없을 때 폴백) |
| `sections` | `sections` | beatCounter.ts | derecho 시작점 → 기준 비트 자동 설정 |
| `phrase_boundaries` | `phraseBoundaries` | phraseDetector.ts | 서버 모드 프레이즈 분할 |
| `confidence` | `confidence` | onDeviceAnalyzer.ts | 낮으면 on-device 분석 폴백 고려 |
| `waveform_peaks` | `waveformPeaks` | WaveformView | 파형 시각화 |
| `unstable_regions` | `unstableRegions` | playerStore | 불안정 구간 dim 표시 |
| `analyzer_engine` | `analyzerEngine` | (표시용) | 어떤 엔진으로 분석했는지 |
| `metadata` | `metadata` | 라이브러리 화면 | 자동 앨범아트/아티스트 표시 |

## 앱의 비트 카운팅 로직 (핵심)

```
기준 비트 결정 순서:
1. 사용자 오프셋 (downbeatOffsets[trackId]) → 최우선
2. sections에서 "derecho" 시작 비트 → 차선
3. downbeats[0] → 최후 폴백

카운트 = (현재비트인덱스 - 기준비트인덱스) % 8 + 1
→ 항상 1~8 순환
```

---

## 버전 변경 규칙

1. **필드 추가**: 기본값 포함하여 추가 → 앱은 무시 가능 → 마이너 버전 (`v1.1`)
2. **필드 타입 변경/제거**: 앱 수정 필요 → inbox 프로토콜로 사전 협의 → 메이저 버전 (`v2.0`)
3. **analyzer_engine 변경**: 엔진 업그레이드 시 새 식별자 부여 (예: `demucs_beat_this_v1`)
4. **변경 시 이 문서 업데이트 + inbox에 알림 메시지 작성**
