# Ritmo 분석 아키텍처 전환 계획

> **최종 업데이트**: 2026-03-18
> **목적**: 서버 의존 분석 → 온디바이스 분석 + 학습 데이터 수집 파이프라인

---

## 1. 현재 상태 (AS-IS)

### 분석 플로우
```
사용자 → [R] 분석 버튼 → analysisApi.analyzeTrack()
  → 오디오 파일 POST (FormData) → jinserver (api.ritmo.kr:3900)
  → Madmom RNNBeatProcessor + Librosa
  → 응답: { bpm, beats[], downbeats[], sections[], phraseBoundaries[], waveformPeaks[] }
  → playerStore에 저장 → 비트카운터 가동
```

### 핵심 파일
| 파일 | 역할 |
|------|------|
| `services/analysisApi.ts` | 서버 통신 (POST /analyze, polling) |
| `types/analysis.ts` | AnalysisResult, Section, Phrase 타입 |
| `constants/config.ts` | API_BASE_URL = api.ritmo.kr |
| `stores/playerStore.ts` | 분석 상태/결과 저장 |
| `utils/beatCounter.ts` | 실시간 비트 카운팅 |
| `utils/phraseDetector.ts` | 프레이즈 감지 (rule/user/server) |
| `utils/beatGenerator.ts` | 탭템포용 합성 비트 생성 |
| `app/(tabs)/index.tsx` | 분석 트리거 UI + 결과 적용 |

### 문제점
1. **네트워크 의존** — 오프라인 사용 불가, 업로드 대기시간 (대형 파일 수분)
2. **서버 비용** — 상시 운영 필요, 트래픽 증가 시 스케일링
3. **범용 분석** — Madmom/Librosa는 범용 비트 트래킹. 살사/바차타 리듬 구조(clave, tumbao) 미인식
4. **정확도 한계** — 라틴 음악은 변속, 폴리리듬, 퍼커션 복잡 → 자동 감지 오류 빈번
5. **사용자가 결국 수동 보정** — 미세조정(±ms), 프레이즈 재배치, BPM 수동 수정

---

## 2. 목표 상태 (TO-BE)

### 핵심 전략
```
Phase 1: 온디바이스 기본 분석 (BPM + 비트 타이밍)
Phase 2: 사용자 보정 데이터 수집 (Human-in-the-loop)
Phase 3: 학습 데이터 축적 → 라틴 특화 모델 학습
Phase 4: 개선된 모델 배포 (서버 or 경량 온디바이스)
```

### 아키텍처 전환
```
[기존]  폰 → 서버(분석) → 폰(결과)
[전환]  폰(분석+보정) → 서버(데이터 수집만)
[미래]  폰(AI분석) ← 서버(모델 학습/배포)
```

---

## 3. 온디바이스 분석 기술스택 평가

### 후보 라이브러리 비교

| 라이브러리 | BPM | Beat Timing | Onset | Expo 호환 | 비고 |
|-----------|-----|-------------|-------|-----------|------|
| **music-tempo** | ✅ | ✅ (beats[]) | ✅ | ✅ JS 순수 | Beatroot 알고리즘. AudioBuffer → {tempo, beats[]} |
| **realtime-bpm-analyzer** | ✅ | ❌ | ✅ | ⚠️ Web Audio API | 실시간 스트림 분석. BPM만 반환, 개별 비트 위치 없음 |
| **web-audio-beat-detector** | ✅ | ⚠️ (offset만) | ✅ | ⚠️ Web Audio API | BPM + 첫 비트 offset. 개별 비트 배열 없음 |
| **essentia.js** | ✅ | ✅ | ✅ | ❌ WASM 호환 문제 | 가장 강력하나 RN 환경에서 document 참조 에러 |
| **expo-audio-studio** | ✅ | ❌ | ❌ | ✅ 네이티브 | BPM만. 비트 타이밍 미지원. 녹음 특화 |
| **@loqalabs/loqa-expo-dsp** | ❌ | ❌ | ❌ | ✅ 네이티브 Rust | FFT만. 비트 감지 없음. DSP 기초 제공 |

### 추천: `music-tempo` (1차) + 커스텀 보강

**선정 이유:**
1. **순수 JS** — Expo Managed에서 바로 사용 가능. WASM/네이티브 모듈 불필요
2. **비트 배열 반환** — `{tempo: 128, beats: [0.45, 0.92, 1.39, ...]}` — 기존 AnalysisResult.beats와 직접 매핑
3. **Beatroot 알고리즘** — Simon Dixon의 학술 알고리즘 기반. onset detection → beat tracking 파이프라인
4. **경량** — 의존성 없음, 번들 크기 미미
5. **AudioBuffer 입력** — expo-av에서 디코딩한 PCM 데이터 바로 투입 가능

**한계 및 보완:**
- Downbeat 감지 없음 → **규칙 기반 추론** (매 4번째 비트 = downbeat, 기존 beatGenerator 패턴)
- 섹션 감지 없음 → **Phase 3에서 ML 모델로 해결** (지금은 rule-based 유지)
- 정확도 Madmom 대비 약간 하락 가능 → **사용자 보정 UX가 이미 있으므로 허용 가능**

### 대안: 네이티브 모듈 (Phase 2+ 고려)

Expo SDK 54는 Expo Modules API로 네이티브 코드 통합 지원. 정확도가 더 필요해지면:

```
옵션 A: C++ TurboModule + Essentia C++ 직접 빌드
옵션 B: Rust FFI (@loqalabs/loqa-expo-dsp 확장)
옵션 C: expo config plugin으로 aubio/Essentia 바인딩
```

이건 출시 후 데이터로 판단해도 충분.

---

## 4. 온디바이스 분석 구현 설계

### 새 파일 구조

```
musicality-app/
├── services/
│   ├── analysisApi.ts           ← 유지 (데이터 수집 전용으로 전환)
│   ├── onDeviceAnalyzer.ts      ← ★NEW 온디바이스 분석 엔진
│   └── analysisDataCollector.ts ← ★NEW 학습 데이터 수집
│
├── utils/
│   ├── beatCounter.ts           (기존 유지)
│   ├── phraseDetector.ts        (기존 유지)
│   ├── beatGenerator.ts         (기존 유지 — 탭템포용)
│   └── audioDecoder.ts          ← ★NEW PCM 디코딩 유틸
```

### onDeviceAnalyzer.ts 설계

```typescript
// services/onDeviceAnalyzer.ts (~200줄)

import MusicTempo from 'music-tempo';

interface OnDeviceAnalysisResult {
  bpm: number;
  beats: number[];          // 비트 타이밍 (초 단위)
  downbeats: number[];      // 매 4비트마다 (추론)
  confidence: number;       // 0~1
  duration: number;         // 곡 길이 (ms)
  waveformPeaks: number[];  // 시각화용
  analysisTimeMs: number;   // 분석 소요 시간
}

export async function analyzeOnDevice(
  fileUri: string,
  format: string
): Promise<OnDeviceAnalysisResult> {

  // 1. 오디오 디코딩 → PCM Float32Array
  const { pcmData, sampleRate, duration } = await decodeAudioToPCM(fileUri, format);

  // 2. music-tempo로 BPM + 비트 감지
  const mt = new MusicTempo(pcmData, {
    minBeatInterval: 60 / 220,  // max 220 BPM (빠른 살사)
    maxBeatInterval: 60 / 60,   // min 60 BPM (느린 바차타)
  });

  const bpm = Math.round(mt.tempo);
  const beats = mt.beats;  // 초 단위 배열

  // 3. Downbeat 추론 (매 4비트)
  const downbeats = beats.filter((_, i) => i % 4 === 0);

  // 4. Waveform peaks 추출 (시각화용)
  const waveformPeaks = extractWaveformPeaks(pcmData, sampleRate, 200);

  // 5. Confidence 계산
  //    - 비트 간격 일관성 기반
  //    - 표준편차가 작을수록 높은 confidence
  const intervals = beats.slice(1).map((b, i) => b - beats[i]);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - avgInterval) ** 2, 0) / intervals.length;
  const confidence = Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / avgInterval));

  return {
    bpm,
    beats,
    downbeats,
    confidence,
    duration: duration * 1000,
    waveformPeaks,
    analysisTimeMs: /* 측정값 */,
  };
}
```

### PCM 디코딩 전략

```typescript
// utils/audioDecoder.ts (~100줄)

// 전략 1: expo-av의 Audio.Sound + getStatusAsync (제한적)
// 전략 2: expo-file-system으로 raw 읽기 + JS 디코딩
// 전략 3: Web Audio API의 decodeAudioData (Expo Web)
// 전략 4: 네이티브 모듈로 PCM 추출 (가장 확실)

// 추천: 전략 4 — 이미 비디오 오디오 추출용 네이티브 모듈 존재
// (analysisApi.ts의 extractAudioFromVideo와 유사 패턴)

export async function decodeAudioToPCM(
  fileUri: string,
  format: string
): Promise<{ pcmData: Float32Array; sampleRate: number; duration: number }> {
  // 네이티브 모듈을 통해 오디오 파일 → PCM Float32Array 변환
  // 모노 다운믹스, 22050Hz 리샘플링 (분석용으로 충분)
  // ...
}
```

### 기존 코드 수정 최소화

```typescript
// app/(tabs)/index.tsx의 runAnalysis() 수정

async function runAnalysis(track: Track) {
  setTrackAnalysisStatus(track.id, 'analyzing');

  try {
    // ★ 변경: 서버 대신 온디바이스
    const result = await analyzeOnDevice(track.uri, track.format);

    // 기존 AnalysisResult 타입으로 변환 (호환성 유지)
    const analysis: AnalysisResult = {
      bpm: result.bpm,
      beats: result.beats,
      downbeats: result.downbeats,
      duration: result.duration,
      confidence: result.confidence,
      sections: [],                    // 온디바이스는 섹션 미지원
      phraseBoundaries: [],            // rule-based로 대체
      waveformPeaks: result.waveformPeaks,
    };

    setTrackAnalysis(track.id, analysis);
    setTrackAnalysisStatus(track.id, 'done');

    // ★ 추가: 초기 분석 데이터 서버 전송 (백그라운드)
    dataCollector.sendInitialAnalysis(track.id, result);

  } catch (error) {
    setTrackAnalysisStatus(track.id, 'error');
  }
}
```

---

## 5. 학습 데이터 수집 파이프라인

### 핵심 아이디어
사용자의 모든 보정 행위가 **라벨링 데이터**. 기계가 틀린 것을 인간이 교정한 결과 = 최고 품질의 학습 데이터.

### 수집 데이터 구조

```typescript
// types/analysisData.ts

interface TrackAnalysisData {
  // ─── 식별 (오디오 자체 미포함) ───
  audioFingerprint: string;       // Chromaprint 해시 (저작권 안전)
  audioFeatures: AudioFeatures;   // spectral 특성 요약

  // ─── 기계 분석 (초기값) ───
  machineAnalysis: {
    bpm: number;
    beats: number[];
    downbeats: number[];
    confidence: number;
    analysisEngine: 'on-device-v1';  // 엔진 버전 추적
    analysisTimeMs: number;
  };

  // ─── 인간 보정 (최종값) ───
  humanCorrections: {
    finalBpm: number;                 // 수동 BPM 수정값
    beatTimeOffset: number;           // ±ms 미세조정
    phraseStructure: PhraseData[];    // 최종 프레이즈 구조
    correctionCount: number;          // 총 수정 횟수 (신뢰도 지표)
    editDurationMs: number;           // 편집에 소요된 총 시간
    editionId: string;                // 어떤 슬롯에서 작업했는지
  };

  // ─── 메타 ───
  metadata: {
    genre?: string;                   // 사용자 태그 (bachata/salsa/etc)
    danceStyle?: string;              // 카운트 스타일 (on1/on2/bachata)
    trackDurationMs: number;
    collectTimestamp: string;          // ISO 8601
    appVersion: string;
    deviceInfo: string;               // 'ios' | 'android' (OS만, 기기 식별 안함)
  };
}

interface AudioFeatures {
  // 저작권 안전한 통계적 특성만 (오디오 복원 불가)
  spectralCentroidMean: number;
  spectralCentroidStd: number;
  rmsEnergyMean: number;
  zeroCrossingRate: number;
  mfcc: number[];                // 13개 MFCC 계수 평균
  onsetStrength: number[];       // onset 강도 곡선 (다운샘플링)
  tempoHistogram: number[];      // BPM 후보 분포
}
```

### 수집 시점

```
┌──────────────────────────────────────────────────────────────┐
│  수집 이벤트                          전송 데이터             │
├──────────────────────────────────────────────────────────────┤
│  1. 온디바이스 분석 완료              machineAnalysis         │
│     → 즉시 (백그라운드)               + audioFeatures         │
│                                       + audioFingerprint     │
│                                                              │
│  2. 사용자 보정 발생                  humanCorrections       │
│     → 디바운스 30초 (편집 세션 종료)   (delta만 전송)         │
│     → 또는 앱 백그라운드 진입 시                              │
│                                                              │
│  3. 최종 스냅샷                       전체 TrackAnalysisData  │
│     → 곡 변경 시 (다른 곡으로 이동)                           │
│     → 앱 종료 시                                             │
└──────────────────────────────────────────────────────────────┘
```

### analysisDataCollector.ts 설계

```typescript
// services/analysisDataCollector.ts (~150줄)

const COLLECTION_ENDPOINT = 'https://api.ritmo.kr/collect';
const DEBOUNCE_MS = 30_000;  // 30초

class AnalysisDataCollector {
  private pendingData: Map<string, TrackAnalysisData> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private consentGiven: boolean = false;

  // ─── 동의 관리 ───
  setConsent(agreed: boolean) {
    this.consentGiven = agreed;
    // AsyncStorage에 저장
  }

  // ─── 1단계: 초기 분석 전송 ───
  async sendInitialAnalysis(trackId: string, result: OnDeviceAnalysisResult) {
    if (!this.consentGiven) return;

    const data: Partial<TrackAnalysisData> = {
      audioFingerprint: await generateFingerprint(trackId),
      audioFeatures: await extractFeatures(trackId),
      machineAnalysis: {
        bpm: result.bpm,
        beats: result.beats,
        downbeats: result.downbeats,
        confidence: result.confidence,
        analysisEngine: 'on-device-v1',
        analysisTimeMs: result.analysisTimeMs,
      },
      metadata: getMetadata(trackId),
    };

    this.pendingData.set(trackId, data as TrackAnalysisData);
    this.sendInBackground(trackId, 'initial');
  }

  // ─── 2단계: 보정 데이터 수집 (디바운스) ───
  recordCorrection(trackId: string, correction: Partial<HumanCorrections>) {
    if (!this.consentGiven) return;

    const existing = this.pendingData.get(trackId);
    if (!existing) return;

    // 기존 corrections에 머지
    existing.humanCorrections = {
      ...existing.humanCorrections,
      ...correction,
      correctionCount: (existing.humanCorrections?.correctionCount ?? 0) + 1,
    };

    // 디바운스 리셋
    const timer = this.debounceTimers.get(trackId);
    if (timer) clearTimeout(timer);
    this.debounceTimers.set(trackId, setTimeout(() => {
      this.sendInBackground(trackId, 'correction');
    }, DEBOUNCE_MS));
  }

  // ─── 3단계: 최종 스냅샷 ───
  async flushTrack(trackId: string) {
    if (!this.consentGiven) return;
    const timer = this.debounceTimers.get(trackId);
    if (timer) clearTimeout(timer);
    await this.sendInBackground(trackId, 'final');
    this.pendingData.delete(trackId);
  }

  // ─── 전송 ───
  private async sendInBackground(trackId: string, stage: string) {
    try {
      const data = this.pendingData.get(trackId);
      if (!data) return;

      await fetch(COLLECTION_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, stage, data }),
      });
    } catch {
      // 실패 시 로컬 큐에 저장, 다음 기회에 재전송
      await this.queueForRetry(trackId);
    }
  }
}

export const dataCollector = new AnalysisDataCollector();
```

### 수집 시 보정 이벤트 연동 포인트

```typescript
// 기존 코드에 dataCollector.recordCorrection() 호출 추가하는 위치들:

// 1. BPM 수동 수정 (⚙️ 설정 모달)
settingsStore.setBpmOverride(trackId, newBpm);
dataCollector.recordCorrection(trackId, { finalBpm: newBpm });

// 2. 비트 미세조정 (⚙️ 설정 모달)
settingsStore.setBeatTimeOffset(trackId, offset);
dataCollector.recordCorrection(trackId, { beatTimeOffset: offset });

// 3. 프레이즈 재배치 (그리드 편집)
phraseDetector.detectPhrasesFromUserMark(...);
dataCollector.recordCorrection(trackId, { phraseStructure: newPhrases });

// 4. 그리드 셀 split/merge
handleSplitPhraseHere(...);
handleMergeWithPrevious(...);
dataCollector.recordCorrection(trackId, { phraseStructure: updatedPhrases });

// 5. 곡 변경 시 최종 flush
useEffect(() => {
  return () => { dataCollector.flushTrack(prevTrackId); };
}, [currentTrack?.id]);
```

---

## 6. 오디오 핑거프린트 (저작권 안전)

### 왜 핑거프린트인가
- 같은 곡을 여러 사용자가 분석 → 핑거프린트로 동일곡 식별
- 오디오 원본은 **절대 서버 전송 안 함** (저작권)
- 핑거프린트 + feature vector만으로는 오디오 복원 불가능

### 구현 옵션

| 방법 | 장점 | 단점 |
|------|------|------|
| **chromaprint.js** | AcoustID 호환, 2.5KB/곡, <100ms | JS 포트 품질 미확인 |
| **자체 해시** | 구현 심플, 의존성 없음 | 동일곡 매칭 정확도 낮음 |
| **MFCC 기반 해시** | 음악적 특성 반영 | 계산 비용 |

### 추천: 2단계 식별

```typescript
// 1차: 경량 해시 (즉시)
function quickHash(pcmData: Float32Array): string {
  // 오디오의 통계적 특성으로 빠른 해시 생성
  // RMS 에너지 곡선 + ZCR 패턴의 SHA-256
  // → 동일 파일 감지용 (동일 곡 다른 인코딩은 미매칭)
}

// 2차: Chromaprint (백그라운드)
async function generateFingerprint(fileUri: string): Promise<string> {
  // chromaprint.js로 정밀 핑거프린트
  // → 동일 곡 다른 인코딩도 매칭 가능
  // → AcoustID API로 곡 메타데이터 조회 가능 (bonus)
}
```

---

## 7. 서버 사이드 (수집 API)

### 엔드포인트

```
POST /collect
  Body: { trackId, stage, data: TrackAnalysisData }
  → 수집 데이터 저장

GET  /collect/stats
  → 수집 현황 대시보드 (곡 수, 보정률, 장르 분포 등)
```

### 데이터 저장 구조

```
analysis_data/
├── raw/                          ← 원본 수집 데이터
│   ├── {fingerprint}/
│   │   ├── machine_v1.json       ← 기계 분석 (여러 사용자 버전)
│   │   ├── corrections/
│   │   │   ├── user_001.json     ← 사용자별 보정 데이터
│   │   │   ├── user_002.json
│   │   │   └── ...
│   │   └── consensus.json        ← 다수결/가중평균 합의 결과
│   └── ...
│
├── training/                     ← 학습용 가공 데이터
│   ├── features/                 ← AudioFeatures 벡터
│   ├── labels/                   ← 합의된 보정값 (정답)
│   └── splits/                   ← train/val/test 분할
│
└── models/                       ← 학습된 모델
    ├── beat_v1/
    ├── phrase_v1/
    └── section_v1/
```

### 합의(Consensus) 알고리즘

같은 곡을 여러 사용자가 보정한 경우:

```python
def compute_consensus(corrections: list[HumanCorrections]) -> ConsensuResult:
    # 1. 가중치 = correctionCount × editDurationMs (꼼꼼한 사용자 우대)
    # 2. BPM: 가중 중앙값
    # 3. Beat offset: 가중 평균
    # 4. Phrase boundaries: 클러스터링 → 다수결
    # 5. Outlier 제거: IQR 기반
    pass
```

---

## 8. 사용자 동의 UX

### 동의 화면 (첫 분석 시)

```
┌────────────────────────────────┐
│                                │
│  🎵 분석 정확도 향상에          │
│     참여하시겠어요?            │
│                                │
│  Ritmo는 여러분의 비트 편집    │
│  데이터를 익명으로 수집하여    │
│  분석 정확도를 개선합니다.     │
│                                │
│  수집되는 정보:                │
│  • BPM 및 비트 보정값          │
│  • 프레이즈 구조 편집 내역     │
│  • 곡의 음향 특성 (통계값)     │
│                                │
│  수집되지 않는 정보:           │
│  • 음원 파일 원본 ❌           │
│  • 개인 식별 정보 ❌           │
│  • 곡 제목/아티스트 ❌         │
│                                │
│  설정에서 언제든 변경 가능     │
│                                │
│  [참여할게요]  [나중에]        │
└────────────────────────────────┘
```

### 설정 화면

```
분석 데이터 공유: [ON/OFF 토글]
  ↳ 수집된 곡 수: 47곡
  ↳ 마지막 전송: 2시간 전
```

---

## 9. 마이그레이션 계획

### Phase 1: 온디바이스 분석 전환

```
1-1. music-tempo 패키지 설치 + PCM 디코딩 유틸 구현
1-2. onDeviceAnalyzer.ts 구현
1-3. analysisApi.ts의 analyzeTrack() → analyzeOnDevice()로 교체
1-4. 기존 AnalysisResult 타입 호환성 유지
1-5. 서버 분석 코드는 삭제하지 않음 (fallback 옵션)
1-6. 테스트: 살사/바차타 10곡 이상 비교 (서버 vs 온디바이스)
```

### Phase 2: 데이터 수집 파이프라인

```
2-1. TrackAnalysisData 타입 정의
2-2. analysisDataCollector.ts 구현
2-3. 동의 화면 UI 구현
2-4. 보정 이벤트 연동 (5개 포인트)
2-5. 서버 수집 API 구현 (POST /collect)
2-6. 오프라인 큐 (실패 시 로컬 저장 → 재전송)
```

### Phase 3: 핑거프린트 + 합의

```
3-1. chromaprint.js 또는 자체 해시 구현
3-2. 서버: 핑거프린트 기반 동일곡 그룹핑
3-3. 합의 알고리즘 구현
3-4. 대시보드: 수집 현황 모니터링
```

### Phase 4: 모델 학습 (데이터 충분 시)

```
4-1. AudioFeatures + HumanCorrections → 학습 데이터셋 구축
4-2. 비트/다운비트 보정 모델 학습
4-3. 프레이즈 경계 감지 모델 학습
4-4. 섹션 분류 모델 학습 (derecho, mambo 등)
4-5. A/B 테스트: 기존 vs 새 모델
4-6. 배포: 서버 API or ONNX 경량 온디바이스
```

---

## 10. 기존 서버(jinserver) 역할 전환

### Before
```
jinserver (api.ritmo.kr)
├── POST /analyze        ← 오디오 분석 (Madmom+Librosa)
├── GET  /analyze/{job}  ← 작업 폴링
└── GET  /health         ← 헬스체크
```

### After
```
jinserver (api.ritmo.kr)
├── POST /analyze        ← 유지 (fallback / 고정밀 옵션)
├── POST /collect        ← ★NEW 학습 데이터 수집
├── GET  /collect/stats  ← ★NEW 수집 현황
├── GET  /health         ← 유지
└── (미래)
    ├── POST /analyze/v2 ← 학습된 모델 기반 분석
    └── GET  /model      ← 경량 모델 다운로드 (온디바이스용)
```

서버 분석은 삭제하지 않고 유지. 온디바이스가 기본값이되, 사용자가 "서버 정밀 분석" 옵션을 선택할 수 있게 하거나, 자동 판단 (confidence 낮으면 서버 재분석 제안) 로직도 가능.

---

## 11. 주의사항

1. **PCM 디코딩이 핵심 관문** — music-tempo는 Float32Array PCM을 요구. Expo에서 오디오 파일 → PCM 변환이 가장 어려운 부분. 기존 비디오 오디오 추출 네이티브 모듈을 확장하는 것이 현실적
2. **분석 시간** — music-tempo는 JS 싱글스레드. 3분 곡 기준 예상 1~5초. UI 블로킹 방지를 위해 `InteractionManager.runAfterInteractions()` 또는 별도 스레드 고려
3. **저작권 절대 원칙** — 오디오 원본, 복원 가능한 데이터는 절대 서버 전송 금지. 핑거프린트 + 통계 feature만
4. **개인정보** — 사용자 ID는 익명 UUID. 이메일/이름 연결 금지. GDPR/개인정보보호법 준수
5. **옵트인 전용** — 데이터 수집은 반드시 사용자 동의 후에만. 기본값 OFF
6. **기존 분석 결과 호환** — 이미 서버 분석된 곡의 AnalysisResult는 그대로 유효. 마이그레이션 불필요
