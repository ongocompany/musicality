# Ritmo Engine 핸드오프 문서

> **From**: 민철 (musicality-app 담당)
> **To**: 민규 (ritmo-engine R&D 담당)
> **Date**: 2026-03-30
> **참조**: `docs/interface/INTERFACE.md` — AnalysisResult 스키마 명세

---

## 1. AnalysisResult 필드별 사용 맵

> 서버 응답은 snake_case, 앱 내부는 camelCase. 변환은 `services/analysisApi.ts:30` `mapAnalysisResult()` 참조.

### `bpm` (float → number)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `hooks/usePlayerCore.ts:236` (`currentBpm` 계산), `app/(tabs)/player.tsx:938` (공유 시 표시), `services/phraseNoteService.ts:219` (PhraseNote 매칭) |
| 사용 방식 | `Math.round(analysis.bpm)` → 정수로 반올림하여 UI에 표시. 사용자가 BPM을 수동 오버라이드할 수 있음 (`bpmOverrides[trackId]`). PhraseNote 매칭 시 BPM ±3 범위로 동일 곡 판별 |
| 중요도 | ★★★ (핵심 표시 정보, 곡 식별에도 사용) |
| 특이사항 | 소수점 BPM이 와도 앱은 항상 반올림. 사용자가 오버라이드하면 `bpmOverride` 값이 우선 |

### `beats` (float[] → number[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | `utils/beatCounter.ts:24` (`findCurrentBeatIndex`), `utils/beatCounter.ts:68` (`computeReferenceIndex`), `utils/beatCounter.ts:118` (`getCountInfo`), `utils/phraseDetector.ts:41` (프레이즈 생성), `hooks/usePlayerCore.ts:197` (`effectiveBeats`), 모든 플레이어 화면 |
| 사용 방식 | **앱의 가장 핵심 데이터.** 초 단위 타임스탬프 배열. 재생 위치(ms)를 `÷1000`하여 이진 탐색으로 현재 비트 인덱스를 찾음. 이 인덱스가 카운팅(1~8), 그리드 셀 렌더링, 프레이즈 계산의 기반 |
| 중요도 | ★★★ (없으면 앱 전체 기능 불가) |
| 특이사항 | **단위: 초(seconds)**. 앱 내부에서 ms 변환 시 `×1000`. `beatTimeOffset`(사용자 미세 조정)이 적용되면 모든 비트에 일괄 오프셋 추가 (`hooks/usePlayerCore.ts:199`) |

### `downbeats` (float[] → number[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | `utils/beatCounter.ts:68` (`computeReferenceIndex` 내 폴백), `hooks/usePlayerCore.ts:204` (`effectiveDownbeats`) |
| 사용 방식 | 기준 비트(1박) 결정의 **최후 폴백**으로 사용. `downbeats[0]`의 가장 가까운 비트 인덱스를 기준점으로 설정. 사용자 오프셋이나 derecho 섹션이 있으면 downbeats는 무시됨 |
| 중요도 | ★★☆ (폴백용이지만, sections가 비어있을 때 유일한 자동 기준) |
| 특이사항 | **단위: 초(seconds)**. 온디바이스 분석에서는 매 4번째 비트를 단순 추론 (`onDeviceAnalyzer.ts:175`). **서버 downbeats가 정확할수록 사용자 수동 보정 빈도가 줄어듦** — 민규가 가장 집중해야 할 부분 |

### `duration` (float → number)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `utils/phraseDetector.ts:17` (마지막 프레이즈 endTime), `hooks/usePlayerCore.ts:139` (imported note duration) |
| 사용 방식 | 트랙 총 길이(초). 마지막 프레이즈의 endTime으로 사용. PhraseNote 매칭 시 duration ±5초 범위로 동일 곡 판별 |
| 중요도 | ★★☆ |
| 특이사항 | 앱의 `playerStore.duration`은 ms 단위(플레이어 콜백), 분석 결과의 `duration`은 초 단위 |

### `beats_per_bar` → `beatsPerBar` (int → number)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `types/analysis.ts:45`, 온디바이스에서 항상 4 고정 |
| 사용 방식 | 마디당 비트 수. 현재 4/4 박자 가정으로 하드코딩된 곳이 많아 실질적 사용은 제한적 |
| 중요도 | ★☆☆ (현재는 항상 4) |
| 특이사항 | 3/4 박자 지원 시 앱 수정 필요. 현재는 참고값 수준 |

### `confidence` (float → number)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `services/onDeviceAnalyzer.ts:137` (비트 간격 일관성 점수), `services/analysisApi.ts:261` (로그 출력) |
| 사용 방식 | 0.0~1.0 범위. 현재 앱에서 confidence 기반 UI 경고를 구현하지는 않았으나, **`confidence < 0.5`이면 "분석 품질 낮음" 경고**를 표시할 예정 (INTERFACE.md 계약) |
| 중요도 | ★☆☆ (현재 로그용, 향후 UI 반영 예정) |
| 특이사항 | 온디바이스에서는 비트 간격 CV(변동계수)로 계산. 서버도 동일 기준이면 좋겠음 |

### `sections` → `sections` (SectionInfo[] → Section[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | `utils/beatCounter.ts:169` (`findDerechoStartBeatIndex`), `utils/beatCounter.ts:152` (`findCurrentSection`), `hooks/usePlayerCore.ts:175` (기준 비트 계산) |
| 사용 방식 | **기준 비트 자동 결정의 핵심.** `sections` 배열에서 `label === 'derecho'`인 첫 섹션의 `startTime` → 가장 가까운 비트 인덱스를 기준 비트로 설정. 그리드 에디터에서 섹션별 배경색/라벨 표시도 가능 |
| 중요도 | ★★★ (자동 기준 비트 결정의 2순위) |
| 특이사항 | **빈 배열이면 → 구조 분석 실패로 간주, downbeats[0] 폴백.** SectionInfo의 `start_time`/`end_time`은 snake_case → `startTime`/`endTime`으로 변환 (`analysisApi.ts:38`). 라벨 종류: `intro`, `derecho`, `majao`, `mambo`, `bridge`, `outro` |

### `phrase_boundaries` → `phraseBoundaries` (float[] → number[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | `hooks/usePlayerCore.ts:186` (서버 모드 프레이즈), `hooks/usePlayerCore.ts:468` (서버 에디션 저장), `utils/phraseDetector.ts:159` (`phrasesFromBoundaries`) |
| 사용 방식 | 초 단위 타임스탬프 배열. 각 타임스탬프를 `findNearestBeatIndex(ts × 1000, beats)`로 비트 인덱스로 변환 → 프레이즈 경계로 사용. 분석 완료 시 비트 인덱스로 변환된 값이 서버 에디션('S')으로 자동 저장됨 |
| 중요도 | ★★☆ (서버 모드에서만 사용, rule-based 폴백 있음) |
| 특이사항 | **빈 배열이면 → rule-based 폴백 (고정 32비트 = 4×8카운트).** 현재 recall이 낮아서 대부분 rule-based로 동작. recall 80%+ 달성하면 서버 모드를 기본으로 전환 가능 |

### `waveform_peaks` → `waveformPeaks` (float[] → number[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | `components/ui/SectionTimeline.tsx:170` (파형 시각화), `components/ui/BoundaryMagnifier.tsx:48` (확대 뷰), `components/ui/InteractiveSectionTimeline.tsx:229`, 모든 플레이어 화면에서 `waveformPeaks` prop 전달 |
| 사용 방식 | 200개 정규화된 진폭 피크 (0.0~1.0). 타임라인 위에 파형 그래프 렌더링. BoundaryMagnifier에서는 가시 범위만 슬라이싱 |
| 중요도 | ★★☆ (시각적 요소, 없어도 기능 동작) |
| 특이사항 | 200개 고정. 온디바이스에서도 동일하게 200개 생성 |

### `fingerprint` (string → string)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `services/cloudSyncManager.ts:146` (Cloud Library 매칭), `services/editionSyncService.ts:47` (에디션 동기화 키), `services/syncManager.ts:273` (Supabase 동기화), `services/phraseNoteService.ts:222` (PhraseNote 자동 매칭), `app/community/share-to-crew.tsx:78` (크루 공유) |
| 사용 방식 | **Chromaprint 오디오 핑거프린트. 곡 식별의 핵심 키.** 에디션 동기화(user_editions 테이블), Cloud Library 중복 감지, PhraseNote 파일 매칭, 크루 공유 시 곡 연결에 사용 |
| 중요도 | ★★★ (동기화/공유의 핵심 식별자) |
| 특이사항 | Cloud Library에서는 64자 prefix로 저장. 온디바이스 분석에서는 미구현 (Phase 3). **새 엔진에서도 반드시 동일 Chromaprint 알고리즘 유지 필요** — 핑거프린트가 바뀌면 기존 사용자의 에디션/동기화가 깨짐 |

### `metadata` → `metadata` (TrackMetadata | null)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `hooks/usePlayerCore.ts:454` (앨범아트 자동 다운로드), `services/analysisApi.ts:47` (매핑) |
| 사용 방식 | AcoustID + MusicBrainz 기반 자동 태깅. `albumArtUrl`이 있으면 Cover Art Archive에서 250px 썸네일 다운로드 → 트랙 썸네일로 설정. `title`, `artist` 표시용 |
| 중요도 | ★☆☆ (있으면 좋지만 없어도 무방) |
| 특이사항 | `album_art_url` → `albumArtUrl`, `release_id` → `releaseId` 변환 |

### `unstable_regions` → `unstableRegions` (UnstableRegion[])

| 항목 | 내용 |
|---|---|
| 사용 파일 | **현재 앱에서 미사용** |
| 사용 방식 | INTERFACE.md에 정의되어 있으나 앱에서 아직 구현하지 않음. 계획: 불안정 구간을 그리드에서 dim 처리 |
| 중요도 | ☆☆☆ (미구현, 향후 과제) |
| 특이사항 | 엔진에서 보내줘도 현재는 무시됨. 앱 구현 시 inbox로 알릴 예정 |

### `analyzer_engine` → `analyzerEngine` (string)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `services/analysisApi.ts` (현재 mapAnalysisResult에 포함 안 됨 — 로그용) |
| 사용 방식 | 어떤 엔진으로 분석했는지 표시. 현재 앱에서 직접 사용하지는 않으나, 향후 엔진별 분기 처리 가능성 |
| 중요도 | ★☆☆ (참조용) |
| 특이사항 | 값 예시: `madmom_chunked_v1`, `beat_this_latin_ft_v1`, `on-device-v1` |

### `cached` (bool)

| 항목 | 내용 |
|---|---|
| 사용 파일 | 앱에서 미사용 |
| 사용 방식 | 서버가 캐시에서 반환했는지 여부. 앱은 무시 |
| 중요도 | ☆☆☆ |

### `file_hash` → `fileHash` (string)

| 항목 | 내용 |
|---|---|
| 사용 파일 | `services/analysisApi.ts:198` (캐시 프리체크용 해시 계산) |
| 사용 방식 | SHA-256 파일 해시. 앱이 분석 요청 전 `GET /analyze/check/{file_hash}`로 캐시 히트 확인. 결과 저장 시에는 사용하지 않음 |
| 중요도 | ★☆☆ (서버 통신 최적화용) |

---

## 2. 앱의 비트 카운팅 로직 상세

> 파일: `utils/beatCounter.ts` — 순수 함수, React/store 의존성 없음

### 기준 비트(Reference Index) 결정 — `computeReferenceIndex()` (:68)

기준 비트는 "댄스의 1박이 어디인지"를 결정한다. 우선순위:

```
1. offsetBeatIndex (사용자 수동 오프셋) → 최우선
   - settingsStore.downbeatOffsets[trackId]에 저장
   - "Now is 1" 버튼 또는 그리드 셀 탭으로 설정

2. sections에서 derecho 시작 비트 → 차선
   - findDerechoStartBeatIndex(beats, sections) (:169)
   - sections.find(s => s.label === 'derecho').startTime → 가장 가까운 비트 인덱스

3. downbeats[0] → 최후 폴백
   - findNearestBeatIndex(downbeats[0] * 1000, beats)
   - downbeats가 비어있으면 index 0 반환
```

### 카운트 계산 — `getCountInfo()` (:118)

```typescript
// 1. 현재 재생 위치에서 비트 인덱스 찾기 (이진 탐색)
const currentIdx = findCurrentBeatIndex(positionMs, beats);

// 2. 기준 비트 인덱스 계산
const refIdx = computeReferenceIndex(beats, downbeats, offsetBeatIndex, sections);

// 3. 카운트 계산: 항상 1~8 순환
const diff = currentIdx - refIdx;
const mod = ((diff % 8) + 8) % 8;  // 음수 모듈로 처리
const count = mod + 1;              // 1-indexed → 1, 2, 3, 4, 5, 6, 7, 8
```

### "Now is 1" 플로우 — `usePlayerCore.ts:412`

사용자가 "Now is 1" 버튼을 탭하면:
1. 현재 재생 위치에서 가장 가까운 비트 인덱스를 찾음 (`findNearestBeatIndex`)
2. 그 인덱스를 `setDownbeatOffset(trackId, beatIndex)`로 저장
3. 이후 모든 카운팅이 이 인덱스 기준으로 1~8 순환

### 민규에게 왜 중요한가

**서버의 `downbeats`가 정확하고, `sections`에서 "derecho"가 정확히 잡히면 → 사용자가 "Now is 1"을 누를 필요가 없어진다.** 이것이 사용자 경험의 핵심 차이:

- 현재: 곡 분석 후 사용자가 직접 1박을 찾아야 함 (수동 보정)
- 목표: 분석 완료 즉시 올바른 1박이 자동 설정됨

바차타/살사에서 "1을 찾는" 것은 댄서에게 가장 중요한 스킬이고, 앱이 이걸 자동으로 해주면 초보 댄서에게 큰 가치가 된다.

---

## 3. 프레이즈 검출 3가지 모드

> 파일: `utils/phraseDetector.ts`, 모드 선택: `hooks/usePlayerCore.ts:150`

### Mode 1: Rule-Based (클라이언트 전용) — `detectPhrasesRuleBased()` (:41)

- **서버 불필요.** 기준 비트에서 고정 길이(기본 32비트 = 4×8카운트)로 앞뒤로 분할
- 8의 배수로 반올림 (최소 8)
- 사용자가 `defaultBeatsPerPhrase`를 설정에서 변경 가능 (8, 16, 24, 32, 40, 48)
- **현재 대부분의 사용자가 이 모드를 사용 중** (서버 프레이즈가 부정확하므로)

### Mode 2: User-Marked (클라이언트 전용) — `detectPhrasesFromUserMark()` (:87)

- 사용자가 프레이즈 경계를 탭 → 기준 비트와의 거리 계산 → 프레이즈 길이 추론
- 8의 배수로 반올림 후 그 길이로 전체 곡을 rule-based로 분할
- 실질적으로 "프레이즈 길이 자동 감지" 보조 수단

### Mode 3: Server Boundaries (서버 의존) — `phrasesFromBoundaries()` (:159)

- `phrase_boundaries` 타임스탬프 배열 → `findNearestBeatIndex`로 비트 인덱스 변환
- 비트 인덱스 0을 항상 첫 경계로 추가
- 연속된 경계 쌍으로 프레이즈 객체 생성
- **빈 배열이면 rule-based로 자동 폴백** (`usePlayerCore.ts:187`)

### 에디션 시스템과의 관계

분석 완료 시 서버 프레이즈 경계가 비트 인덱스로 변환되어 'S' 에디션에 저장된다 (`usePlayerCore.ts:468`). 사용자는 이 에디션을 베이스로 수정하거나, 새 에디션(최대 3개)을 만들 수 있다. 에디션은 Supabase `user_editions` 테이블에 fingerprint 기준으로 동기화된다.

### 민규에게 왜 중요한가

현재 서버 모드(`phrase_boundaries`)의 recall이 낮아서, 대부분 rule-based 폴백이 작동한다. **recall을 80%+ 달성하면 서버 모드를 기본으로 전환할 수 있고**, 사용자가 수동으로 프레이즈를 편집할 필요가 크게 줄어든다.

---

## 4. 섹션(sections) 사용 방식

> 파일: `utils/beatCounter.ts:169` — `findDerechoStartBeatIndex()`

### 핵심 로직

```typescript
// beatCounter.ts:169
function findDerechoStartBeatIndex(beats, sections): number | null {
  const derecho = sections.find(s => s.label === 'derecho');
  if (!derecho || beats.length === 0) return null;
  return findNearestBeatIndex(derecho.startTime * 1000, beats);
}
```

1. `sections` 배열에서 `label === 'derecho'`인 **첫 번째** 섹션을 찾음
2. 그 섹션의 `startTime`(초) → `×1000` → 가장 가까운 비트 인덱스
3. 이 인덱스가 자동 기준 비트(2순위)로 사용됨

### 폴백 동작

- `sections`가 빈 배열 → derecho 없음 → downbeats[0] 폴백 (3순위)
- `sections`에 derecho가 없고 다른 라벨만 있음 → 같은 폴백
- **sections 자체가 undefined** → camelCase 변환 시 `undefined`가 되어 역시 폴백

### 그리드 에디터에서의 표시

`findCurrentSection(positionMs, sections)` (`beatCounter.ts:152`)으로 현재 위치의 섹션을 찾아 그리드에 라벨/색상 표시 가능 (현재 구현은 제한적).

### 민규에게 왜 중요한가

**derecho의 정확한 시작 시점이 자동 기준 비트의 품질을 결정한다.** 바차타에서 intro → derecho 전환 지점이 정확하면, 별도 사용자 조작 없이 올바른 카운팅이 시작된다. mambo/majao 구분이 정확해지면 섹션별 시각적 가이드도 제공할 수 있다.

---

## 5. On-Device 분석과의 관계

> 파일: `services/onDeviceAnalyzer.ts`

### 구조

- `music-tempo` 라이브러리 (Beatroot 알고리즘) 사용
- PCM 디코딩 → 비트 감지 → downbeat 추론 (매 4번째) → 파형 피크 추출 → confidence 계산

### 서버 분석 vs 온디바이스 분석

| 항목 | 서버 (ritmo-engine) | 온디바이스 (music-tempo) |
|---|---|---|
| BPM | ★★★ 정확 | ★★☆ 보통 |
| beats | ★★★ 정확 | ★★☆ 라틴 폴리리듬에서 약함 |
| downbeats | ★★☆ | ★☆☆ (매 4번째 추론, 부정확) |
| sections | 제공 | **미제공** (빈 배열) |
| phrase_boundaries | 제공 (recall 낮음) | **미제공** (빈 배열) |
| fingerprint | Chromaprint 제공 | **미제공** |
| 속도 | ~47초 | ~1-5초 |
| 결과 형식 | `AnalysisResult` | `AnalysisResult` (동일) |

### 폴백 시나리오

```
서버 도달 가능?
  ├─ Yes → 서버 분석 사용
  └─ No  → 온디바이스 분석 폴백
           └─ sections/phraseBoundaries 빈 배열
           └─ rule-based 프레이즈로 자동 전환
```

### 민규에게 왜 중요한가

**동일 `AnalysisResult` 형식**이므로 엔진 개선이 앱에 즉시 반영된다. 서버 분석이 빠르고 정확해질수록 온디바이스 폴백의 필요성이 줄어든다. 다만 오프라인 사용 시나리오를 위해 온디바이스는 유지한다.

---

## 6. 앱이 기대하는 개선 사항 (위시리스트)

우선순위 순:

### 1. 다운비트 정확도 개선 — 사용자 영향: ★★★

바차타/살사에서 "1박"을 정확히 잡아주면 사용자가 매번 "Now is 1"을 누를 필요가 없다. 현재 가장 큰 사용자 불만.

**성공 기준**: 100곡 테스트 중 80%+에서 올바른 1박이 자동 설정.

### 2. 섹션 분류 정확도 — 사용자 영향: ★★★

derecho/mambo/majao 구분이 정확하면 자동 기준 비트(2순위)가 맞아서 downbeat 정확도와 시너지.

**성공 기준**: derecho 시작점이 ±2비트 이내.

### 3. 프레이즈 경계 정확도 — 사용자 영향: ★★☆

recall 40%→80%+ 이면 서버 모드가 기본이 될 수 있다. 프레이즈가 정확하면 자동 안무 큐 타이밍도 가능.

**성공 기준**: recall 80%+, precision 70%+.

### 4. 분석 속도 — 사용자 영향: ★★☆

47초→5초 이하. Beat This! 파인튜닝 성공 시 달성 가능. 사용자 대기 시간 감소.

### 5. 픽업 카운트 감지 — 사용자 영향: ★☆☆

intro에서 불완전한 마디 자동 감지. pnote 100곡 마일스톤 시 학습 데이터 확보 후 진행.

---

## 7. snake_case → camelCase 매핑

> 파일: `services/analysisApi.ts:30` — `mapAnalysisResult()`

```typescript
function mapAnalysisResult(data: any): AnalysisResult {
  return {
    bpm:              data.bpm,                    // 동일
    beats:            data.beats,                  // 동일
    downbeats:        data.downbeats,              // 동일
    duration:         data.duration,               // 동일
    beatsPerBar:      data.beats_per_bar,          // ← 변환
    confidence:       data.confidence,             // 동일
    sections:         data.sections?.map(s => ({   // ← 내부 필드 변환
      label:      s.label,
      startTime:  s.start_time,                    //   ← 변환
      endTime:    s.end_time,                      //   ← 변환
      confidence: s.confidence,
    })),
    phraseBoundaries: data.phrase_boundaries ?? [], // ← 변환 + 기본값
    waveformPeaks:    data.waveform_peaks ?? [],    // ← 변환 + 기본값
    fingerprint:      data.fingerprint ?? undefined,
    metadata:         data.metadata ? {
      title:       data.metadata.title,
      artist:      data.metadata.artist,
      album:       data.metadata.album,
      albumArtUrl: data.metadata.album_art_url,    //   ← 변환
      releaseId:   data.metadata.release_id,       //   ← 변환
    } : undefined,
    cloudTrackId:     data.cloud_track_id ?? undefined, // ← 변환
  };
}
```

**새 필드 추가 시**: 이 함수에 매핑을 추가해야 함 → inbox로 민철에게 알림 필요.

---

## 8. 에러/폴백 시나리오

| 상황 | 앱 동작 | 관련 코드 |
|---|---|---|
| 서버 unreachable | 온디바이스 분석 폴백 (수동 트리거) | `onDeviceAnalyzer.ts` |
| confidence < 0.5 | (예정) 사용자에게 "분석 품질 낮음" 경고 | INTERFACE.md 계약 |
| sections 빈 배열 | derecho 기준 비트 불가 → downbeats[0] 폴백 | `beatCounter.ts:78` |
| phrase_boundaries 빈 배열 | rule-based 프레이즈로 폴백 (32비트 고정) | `usePlayerCore.ts:187` |
| downbeats 빈 배열 | beats 인덱스 0을 기준으로 사용 | `beatCounter.ts:85` |
| beats 빈 배열 | 카운팅 불가, null 반환 → UI에 "--" 표시 | `beatCounter.ts:126` |
| HTTP 429 | 이미 분석 중인 job 폴링으로 전환 | `analysisApi.ts:228` |
| HTTP 202 | 비동기 job 시작, 2초 간격 폴링 | `analysisApi.ts:256` |
| 분석 타임아웃 | 에러 표시, 사용자가 재시도 가능 | `analysisApi.ts:188` |
| 앱 백그라운드 진입 중 분석 | `pendingJobId` 저장, 복귀 시 `resumeAnalysisJob()` | `analysisApi.ts:106` |

---

## 부록: 앱 아키텍처 간단 요약

```
┌─────────────────────────────────────────────────────────────┐
│  UI Layer (React Native / Expo Router)                      │
│  app/(tabs)/player.tsx, screens/player/*.tsx                │
├─────────────────────────────────────────────────────────────┤
│  Hook Layer                                                  │
│  hooks/usePlayerCore.ts  ← 모든 플레이어 로직 통합          │
├─────────────────────────────────────────────────────────────┤
│  Utils (순수 함수)                    │  Stores (Zustand)    │
│  utils/beatCounter.ts    ← 비트 계산  │  playerStore.ts      │
│  utils/phraseDetector.ts ← 프레이즈   │  settingsStore.ts    │
│  utils/beatGenerator.ts  ← 합성 비트  │                      │
├─────────────────────────────────────────────────────────────┤
│  Services                                                    │
│  analysisApi.ts       ← 서버 통신 + snake→camelCase 변환    │
│  onDeviceAnalyzer.ts  ← 온디바이스 폴백                     │
│  analysisStorage.ts   ← 분석 결과 로컬 파일 저장            │
│  editionSyncService.ts ← 에디션 Supabase 동기화             │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. 프로젝트 환경 설정

### 환경변수 파일 구조

```
musicality/
├── musicality-app/
│   ├── .env.example      ← 템플릿 (git에 포함, 값 비어있음)
│   ├── .env.local         ← 실제 값 (gitignored)
│   └── constants/config.ts ← process.env.EXPO_PUBLIC_XXX 참조
├── server/
│   ├── .env.example       ← 서버 템플릿 (git에 포함)
│   └── .env               ← 실제 값 (jinserver 머신에만 존재, gitignored)
└── .gitignore             ← .env, .env.local, .env.production 무시
```

### 앱 환경변수 (`musicality-app/.env.local`)

| 변수 | 용도 | 비고 |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | 분석 서버 URL | `https://api.ritmo.kr` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 공개값 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 클라이언트 키 | 공개값 (anon role) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS 빌드 프로젝트 ID | `app.json`에도 있음 |

- Expo SDK 54: `EXPO_PUBLIC_` prefix → `process.env.EXPO_PUBLIC_XXX`로 접근
- `.env.local`이 없으면 코드 내 fallback 값 사용 (하드코딩 폴백 유지)

### 서버 환경변수 (`server/.env`)

| 변수 | 용도 | 보안 |
|---|---|---|
| `HOST` / `PORT` | 서버 바인딩 (`0.0.0.0:3900`) | - |
| `SUPABASE_URL` | Supabase 프로젝트 URL | 공개 |
| `SUPABASE_KEY` | Supabase anon key | 공개 |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key | **비밀 — 절대 커밋 금지** |
| `ACOUSTID_API_KEY` | AcoustID 핑거프린트 API | 비밀 |

- 실제 파일 위치: `jinserver:/home/jinwoo/musicality/server/.env`
- `server/.env.example` 참고하여 구성

### 민규에게 전달해야 할 것

ritmo-engine 환경 구성 시:
1. **`musicality-app/.env.example`** 참고 → 앱이 어떤 환경변수를 쓰는지 파악
2. **`server/.env.example`** 참고 → 서버에 필요한 키 목록
3. **`SUPABASE_SERVICE_KEY`**는 진우형에게 직접 받을 것 (채팅/DM으로 전달)
4. **`ACOUSTID_API_KEY`**: `5urpeh7f0F` (무료 티어, 공유 가능)

### 인프라 참조

서버 구성, SSH 접속 정보, 배치 파이프라인 등 상세: **`docs/INFRASTRUCTURE.md`** 참조.

---

> 문서 끝. 궁금한 점은 `ritmo-engine/docs/inbox/`에 메시지 남겨주면 확인할게. — 민철
