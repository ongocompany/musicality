# Ritmo UI Refactoring Plan v5

> **최종 업데이트**: 2026-03-18
> **참조 목업**: `UI_MOCKUP.html` (v5 — 롱프레스 모드 토글)
> **목적**: player.tsx 2797줄 → 6개 모드 화면으로 분리 + UX 개선

---

## 1. 문제 진단

### 핵심 문제
1. **player.tsx 2797줄** — 오디오/비디오 플레이어 + 보기/그리드편집/포메이션편집이 한 파일에 전부 존재
2. **FormationStageView.tsx 1765줄** — 뷰어/에디터/패턴생성기/댄서컴포넌트가 통합
3. **소형 화면 대응 부재** — iPhone 17 Pro Max 기준 개발 → 소형 안드로이드에서 UI 어긋남
4. **편집 UI 상시 노출** — View 모드에서도 BeatOffset, EditionPicker, DraftActions 등이 줄을 차지

### 영향받는 파일
| 파일 | 줄 수 | 상태 |
|------|------|------|
| `app/(tabs)/player.tsx` | 2797 | 🔴 긴급 |
| `components/ui/FormationStageView.tsx` | 1765 | 🔴 긴급 |
| `components/ui/PhraseGrid.tsx` | 1062 | 🟡 다음 단계 |
| `app/(tabs)/index.tsx` | 1284 | 🟡 다음 단계 |

---

## 2. UX 결정사항 (v5 확정)

목업 반복(v1→v5)을 통해 확정된 UX 변경사항.

### 2-1. 슬롯 시스템 → 라이브러리에서 선택
- **기존**: 플레이어 상단에 슬롯 선택 바 (에디션 피커) 상시 노출
- **변경**: 라이브러리 파일리스트에서 왼쪽 스와이프로 슬롯(에디션) 선택 (기 구현)
- **플레이어**: 헤더에 현재 슬롯 인디케이터 `[S ●]`만 표시 (●=자동저장 녹색 dot)
- **효과**: 슬롯바 1줄 절약

### 2-2. ⚙️ 설정 모달 (특수 기능 통합)
- **기존**: BeatOffset 행, EditionPicker 행이 상시 노출
- **변경**: 헤더에 ⚙️ 버튼 하나. 탭하면 바텀시트 모달 열림
- **모달 항목**:
  - 🎯 비트 미세조정 (±ms)
  - 📤 내보내기 (Export PhraseNote/ChoreoNote)
  - 📥 가져오기 (Import)
  - 🔄 재분석 (서버 비트 재분석)
  - 🎵 BPM 수동 설정
  - 🗑️ 전체 리셋
- **효과**: 오프셋행 + 에디션행 = 2줄 절약

### 2-3. 자동저장 + DraftActions 제거
- **기존**: 저장/되돌리기/리셋 버튼이 상시 노출 (1줄)
- **변경**: 슬롯 선택 후 실시간 자동저장. 저장 버튼 불필요
- **Undo**: 하단 컨트롤바로 이동 (편집 모드일 때만 ↩ 노출)
- **효과**: 드래프트행 1줄 절약

### 2-4. 롱프레스 모드 토글 `[🔢 | 👥]`
이것이 v5의 핵심 UX.

**컨트롤바 왼쪽에 세그먼트 컨트롤 배치:**
```
[🔢 | 👥]  1.0x  ⏮  |  ▶  |  ⏭  🔊  (↩)
 ▲ 모드      속도  스킵   재생   스킵 볼륨 undo
```

**조작 방식:**
| 동작 | 🔢 (Grid) | 👥 (Formation) |
|------|-----------|----------------|
| **탭** | → Grid View | → Form View |
| **롱프레스 (0.5s)** | → Grid Edit | → Form Edit |

**색상 피드백:**
| 상태 | 세그먼트 색상 | dot 색상 |
|------|-------------|----------|
| View 모드 | Teal 배경 (#03DAC6) | Teal dot |
| Edit 모드 | Purple 배경 (#BB86FC) | Purple dot |
| 비활성 | 투명 | 없음 |

**장점:**
- ✏️ 버튼 제거 — 별도 edit 토글 불필요
- 버튼 2개로 4가지 모드 커버 (Grid View/Edit + Form View/Edit)
- 탭=가벼운 동작(보기), 롱프레스=의도적 동작(편집) → 실수 방지
- 현재 모드를 색상으로 즉시 인지

### 2-5. 포메이션 도구 → 모달
- **기존**: 패턴 생성 버튼, 댄서 수 조절 등이 FormationStageView 내부에 상시 노출
- **변경**: Form Edit 화면에서 `[🎯 배치]` 버튼만 상시 노출. 탭하면 모달 열림
- **모달 내용**: 패턴 선택(line, circle, V, diamond...), 스테이지 프리셋, 댄서 수, 이름 편집

### 2-6. 화면 부동산 확보 결과
| 항목 | 기존 (소형폰) | 변경 (소형폰) | 절약 |
|------|-------------|-------------|------|
| 슬롯/에디션 바 | 1줄 | 0 (라이브러리) | 1줄 |
| BeatOffset 행 | 1줄 | 0 (⚙️ 모달) | 1줄 |
| 에디션피커 행 | 1줄 | 0 (⚙️ 모달) | 1줄 |
| 드래프트 저장/취소 | 1줄 | 0 (자동저장) | 1줄 |
| **합계** | | | **4줄** |
| 그리드 행 (Edit) | ~4행 | ~7행 | +3행 |
| 그리드 행 (View) | ~5행 | ~8행 | +3행 |

---

## 3. 6개 모드 페이지 매트릭스

```
                    View          Grid Edit       Form View       Form Edit
                 ─────────────────────────────────────────────────────────────
  Audio          AudioView      AudioGridEdit    AudioFormView   AudioFormEdit
  Video/YouTube  VideoView      VideoGridEdit        (N/A)           (N/A)
```

**모드 전환 동선 (오디오):**
```
        🔢 탭           🔢 롱프레스
   ┌──────────── Grid View ←──────────── Grid Edit
   │              ↑ 🔢탭                   ↑ 🔢롱프
   │              │                        │
   │  👥 탭       │ 🔢탭        👥 롱프    │ 🔢롱프
   │              │                        │
   │              ↓ 👥탭                   ↓ 👥롱프
   └──────────── Form View ←──────────── Form Edit
        👥 탭           👥 롱프레스
```

---

## 4. 각 모드별 화면 구성

### AudioView (🔢 탭)
```
┌─────────────────────────────┐
│ 🎵 Title          128 BPM  │  ← 헤더 (최소)
│                             │
│          5                  │  ← 카운트 (大, 140px)
│                             │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │  PhraseGrid (읽기전용)  │ │  ← 7~8행 (소형폰)
│ │                         │ │
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ 1:23              3:45      │
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊  │  ← 컨트롤바 (🔢 teal 활성)
└─────────────────────────────┘
```

### AudioGridEdit (🔢 롱프레스)
```
┌─────────────────────────────┐
│ 🎵 Title  [S●] 128BPM  ⚙️  │  ← 헤더 (슬롯 + 설정)
│          5                  │  ← 카운트 (小, 56px)
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │  PhraseGrid (편집)      │ │  ← 7행 (소형폰)
│ │  셀탭 → 노트편집        │ │
│ │                         │ │
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ 1:23              3:45      │
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊 ↩│  ← 컨트롤바 (🔢 purple + ↩)
└─────────────────────────────┘
  ⚙️ 탭 → 바텀시트 (미세조정/Export/Import/재분석/BPM/리셋)
```

### AudioFormView (👥 탭)
```
┌─────────────────────────────┐
│ 🎵 Title          128 BPM  │  ← 헤더 (최소)
│ ┌─────────────────────────┐ │
│ │  FormationViewer        │ │  ← 스테이지 (160px 소형, 210px 대형)
│ │  (애니메이션만, 편집X)  │ │    댄서가 비트에 따라 자동 이동
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │  PhraseGrid (읽기전용)  │ │  ← 4~6행
│ │  포메이션 dot 표시      │ │
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊  │  ← 컨트롤바 (👥 teal 활성)
└─────────────────────────────┘
```

### AudioFormEdit (👥 롱프레스)
```
┌─────────────────────────────┐
│ 🎵 Title  [S●] 128BPM  ⚙️  │  ← 헤더 (슬롯 + 설정)
│ ┌─────────────────────────┐ │
│ │  FormationEditor        │ │  ← 스테이지 (140px 소형, 190px 대형)
│ │  (댄서 드래그 가능)     │ │
│ └─────────────────────────┘ │
│      [🎯 배치]              │  ← 최소 툴바 (탭 → 패턴/프리셋 모달)
│ ┌─────────────────────────┐ │
│ │  PhraseGrid (편집)      │ │  ← 3~5행
│ │  포메이션 키프레임 편집  │ │
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊 ↩│  ← 컨트롤바 (👥 purple + ↩)
└─────────────────────────────┘
```

### VideoView (🔢 탭)
```
┌─────────────────────────────┐
│ 🎬 Title          128 BPM  │  ← 헤더 (최소)
│ ┌─────────────────────────┐ │
│ │  🎬 Video Player        │ │  ← 비디오 (접기/풀스크린)
│ │              5           │ │    오버레이 카운트
│ └─────────────────────────┘ │
│          ▲ 접기             │
│ ┌─────────────────────────┐ │
│ │  PhraseGrid (읽기전용)  │ │  ← 5~7행
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊  │  ← 컨트롤바 (🔢 teal)
└─────────────────────────────┘
```
> 비디오 모드에서 👥은 비활성(disabled) 처리. 비디오는 Grid만 지원.

### VideoGridEdit (🔢 롱프레스)
```
┌─────────────────────────────┐
│ 🎬 Title  [S●] 128BPM  ⚙️  │  ← 헤더 (슬롯 + 설정)
│ ┌─────────────────────────┐ │
│ │  🎬 Video Player        │ │  ← 비디오 (축소)
│ └─────────────────────────┘ │
│          ▲ 접기             │
│ ┌─────────────────────────┐ │
│ │  PhraseGrid (편집)      │ │  ← 4~6행
│ └─────────────────────────┘ │
│ ▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔ │  ← 시크바
│ [🔢·👥] 1x ⏮ | ▶ | ⏭ 🔊 ↩│  ← 컨트롤바 (🔢 purple + ↩)
└─────────────────────────────┘
```

---

## 5. 컨트롤바 상세 설계

### 레이아웃
```
┌──────────────────────────────────────────────┐
│  [🔢│👥]  1.0x  ⏮  │  ▶  │  ⏭  🔊  (↩)   │
│  ├─────┘  │     │      │      │   │    │     │
│  모드     속도   스킵   재생   스킵 볼륨 undo  │
│  세그먼트                                     │
└──────────────────────────────────────────────┘
```

### 모드 세그먼트 `[🔢 | 👥]` 동작 정의

```typescript
// 모드 세그먼트 상태 관리
type PlayerMode = 'grid-view' | 'grid-edit' | 'form-view' | 'form-edit';

// 🔢 버튼 핸들러
onGridTap:       () => setMode('grid-view')
onGridLongPress: () => setMode('grid-edit')   // 0.5초 (500ms)

// 👥 버튼 핸들러
onFormTap:       () => setMode('form-view')
onFormLongPress: () => setMode('form-edit')   // 0.5초 (500ms)

// 비디오 모드에서는 👥 비활성 (disabled + opacity: 0.3)
// 비디오: 🔢 탭=VideoView, 🔢 롱프레스=VideoGridEdit
```

### 세그먼트 시각적 상태

```typescript
// 🔢 버튼 스타일
const gridBtnStyle = {
  'grid-view': { bg: 'rgba(3,218,198,0.2)', dotColor: '#03DAC6' },  // teal
  'grid-edit': { bg: 'rgba(187,134,252,0.25)', dotColor: '#BB86FC' }, // purple
  'form-*':   { bg: 'transparent', dotColor: 'none' },                // 비활성
};

// 👥 버튼 스타일 (반대)
const formBtnStyle = {
  'form-view': { bg: 'rgba(3,218,198,0.2)', dotColor: '#03DAC6' },
  'form-edit': { bg: 'rgba(187,134,252,0.25)', dotColor: '#BB86FC' },
  'grid-*':   { bg: 'transparent', dotColor: 'none' },
};
```

### 조건부 요소
| 요소 | 조건 |
|------|------|
| ↩ (Undo) | Edit 모드일 때만 (`*-edit`) |
| ⚙️ (헤더) | Edit 모드일 때만 |
| [S●] (헤더) | Edit 모드일 때만 |
| 👥 (세그먼트) | Audio 모드에서만 활성. Video면 disabled |

---

## 6. ⚙️ 설정 모달 상세

```
┌────────────────────────────┐
│         ─────              │  ← 핸들
│  ⚙️ 트랙 설정              │
│                            │
│  🎯  비트 미세조정    0ms  │  ← Slider 또는 ±버튼
│  📤  내보내기 (Export)      │  ← PhraseNote/ChoreoNote 공유
│  📥  가져오기 (Import)      │  ← 다른 사람의 노트 불러오기
│  ──────────────────────    │
│  🔄  재분석                 │  ← 서버에서 비트 다시 분석
│  🎵  BPM 수동 설정   128   │  ← 숫자 직접 입력
│  ──────────────────────    │
│  🗑️  전체 리셋             │  ← 빨간색, 모든 편집 초기화
└────────────────────────────┘
```

이 모달은 Edit 모드 헤더의 ⚙️ 버튼을 탭하면 바텀시트로 올라옴.

---

## 7. 파일 구조 설계

```
musicality-app/
├── app/
│   └── (tabs)/
│       └── player.tsx                    ← 라우터 엔트리 (~50줄)
│                                           playerMode 보고 화면 분기만
│
├── screens/player/                       ← 6개 모드 화면
│   ├── AudioViewScreen.tsx               (~250줄)
│   ├── AudioGridEditScreen.tsx           (~300줄)
│   ├── AudioFormViewScreen.tsx           (~280줄)
│   ├── AudioFormEditScreen.tsx           (~320줄)
│   ├── VideoViewScreen.tsx               (~250줄)
│   └── VideoGridEditScreen.tsx           (~300줄)
│
├── hooks/
│   ├── usePlayerCore.ts                  ← 모든 화면 공유 로직 (~500줄)
│   │   ├── countInfo, phraseMap, effectiveBeats 계산
│   │   ├── seekTo, togglePlay, skipBack/Forward
│   │   ├── loopStart/End 관리
│   │   ├── cellNote get/set
│   │   ├── PhraseNote import/export/share
│   │   ├── 분석 트리거
│   │   └── BPM override, beatTimeOffset
│   │
│   ├── usePlayerMode.ts                  ← 모드 세그먼트 상태 관리 (~80줄) ★NEW
│   │   ├── playerMode: 'grid-view' | 'grid-edit' | 'form-view' | 'form-edit'
│   │   ├── onGridTap / onGridLongPress
│   │   ├── onFormTap / onFormLongPress
│   │   └── isEdit, isFormation computed
│   │
│   ├── useFormationEditor.ts             ← 포메이션 편집 전용 (~200줄)
│   │   ├── 키프레임 관리
│   │   ├── undo/redo 스택
│   │   ├── fractionalBeatIndex 계산
│   │   └── 자동저장
│   │
│   ├── useAutoSave.ts                    ← 자동저장 로직 (~60줄) ★NEW
│   │   ├── debounced save (500ms)
│   │   └── 슬롯별 저장 관리
│   │
│   ├── useVideoControls.ts              ← 비디오 전용 (~150줄)
│   │   ├── collapse/expand 애니메이션
│   │   ├── 풀스크린 진입/퇴장
│   │   └── PanResponder
│   │
│   ├── useFocusMode.ts                  ← 포커스모드 (~80줄)
│   │   ├── 탭바 숨기기/복원
│   │   └── 애니메이션
│   │
│   ├── useAudioPlayer.ts                (기존 유지)
│   ├── useVideoPlayer.ts                (기존 유지)
│   ├── useYouTubePlayer.ts              (기존 유지)
│   ├── useCuePlayer.ts                  (기존 유지)
│   └── useTapTempoCue.ts                (기존 유지)
│
├── components/player/                    ← 플레이어 공유 컴포넌트
│   ├── PlayerHeader.tsx                  (~100줄) 제목 + BPM + [S●] + ⚙️
│   ├── PlaybackControlBar.tsx            (~150줄) ★변경 — 모드 세그먼트 포함
│   │   ├── ModeSegment [🔢|👥]
│   │   ├── speed, skip, play, volume
│   │   └── undo (edit only)
│   ├── ModeSegment.tsx                   (~100줄) ★NEW — 롱프레스 제스처 + 색상 피드백
│   ├── SeekSection.tsx                   (~80줄)  타임라인 + 시크바
│   ├── SettingsModal.tsx                 (~150줄) ★NEW — ⚙️ 바텀시트
│   │   ├── 비트 미세조정
│   │   ├── Export / Import
│   │   ├── 재분석 / BPM 수동
│   │   └── 전체 리셋
│   ├── LoopControls.tsx                  (~60줄)  A-B 루프 인라인
│   ├── CountDisplay.tsx                  (~60줄)  카운트 숫자 + 바운스
│   ├── MarqueeTitle.tsx                  (~60줄)  스크롤 제목
│   ├── VideoSection.tsx                  (~200줄) 비디오 렌더 + 접기/풀스크린
│   ├── TapTempoPanel.tsx                 (~80줄)  유튜브 탭템포 UI
│   ├── PlayerModals.tsx                  (~150줄) BPM편집, 공유, 분석메뉴 등 기타 모달
│   └── FocusModeOverlay.tsx              (~50줄)  포커스 모드 오버레이
│
├── components/formation/                 ← 포메이션 (FormationStageView에서 분리)
│   ├── FormationStageViewer.tsx          (~250줄) 순수 애니메이션 렌더링
│   │   ├── 스테이지 배경 그리드
│   │   ├── 댄서 보간 렌더링
│   │   └── 재생 중 자동 비트 추적
│   │
│   ├── FormationStageEditor.tsx          (~300줄) 드래그 편집 + 최소 툴바
│   │   ├── DancerBox 드래그 핸들링
│   │   ├── 키프레임 추가/삭제
│   │   └── [🎯 배치] 버튼만
│   │
│   ├── FormationToolsModal.tsx           (~250줄) 🎯 배치 모달
│   │   ├── 패턴 선택 (line, circle, V, diamond, pairs 등)
│   │   ├── 스테이지 프리셋
│   │   ├── 댄서 수 조절
│   │   └── 댄서 이름 편집
│   │
│   ├── DancerBox.tsx                     (~200줄) 개별 댄서 드래그 컴포넌트
│   │   ├── PanResponder
│   │   ├── 이름 표시
│   │   └── 선택/하이라이트
│   │
│   └── formationPatterns.ts              (~200줄) 패턴 좌표 생성 유틸리티
│
└── components/ui/                        ← 기존 유지 (변경 최소화)
    ├── PhraseGrid.tsx                    (기존 유지, 추후 리팩토링)
    ├── PhraseGridCell.tsx                (기존 유지)
    └── ...
```

### v4 대비 제거되는 컴포넌트
| 컴포넌트 | 이유 |
|---------|------|
| `EditionPicker.tsx` | 라이브러리에서 슬롯 선택 |
| `DraftActions.tsx` | 자동저장으로 대체 |
| `BeatOffsetRow.tsx` | ⚙️ 설정 모달로 이동 |

### v4 대비 추가되는 컴포넌트
| 컴포넌트 | 역할 |
|---------|------|
| `ModeSegment.tsx` | [🔢\|👥] 롱프레스 제스처 세그먼트 |
| `SettingsModal.tsx` | ⚙️ 특수 기능 바텀시트 |
| `usePlayerMode.ts` | 모드 상태 관리 훅 |
| `useAutoSave.ts` | 자동저장 로직 훅 |

---

## 8. 핵심 훅: usePlayerCore

```typescript
// hooks/usePlayerCore.ts (~500줄)
// 모든 플레이어 화면에서 공유하는 핵심 로직

export function usePlayerCore() {
  // ─── Store 구독 ───
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const { isPlaying, position, duration, playbackRate } = usePlayerStore();
  // ... (settingsStore 구독들)

  // ─── 플레이어 훅 통합 ───
  const audioPlayer = useAudioPlayer();
  const videoPlayer = useVideoPlayer();
  const youtubePlayer = useYouTubePlayer();
  useCuePlayer();

  const togglePlay = /* isYouTube ? ... : isVideo ? ... : audio */;
  const seekTo = /* 동일 분기 */;

  // ─── 비트/프레이즈 계산 ───
  const effectiveBeats = useMemo(() => { ... });
  const phraseMap = useMemo(() => { ... });
  const countInfo = useMemo(() => { ... });
  const currentBpm = useMemo(() => { ... });

  // ─── 핸들러 ───
  const handleGridTapBeat = useCallback(...);
  const handleReArrangePhrase = useCallback(...);
  // ... (기존 핸들러들)

  // ─── Props 번들 ───
  return {
    currentTrack, isPlaying, position, duration, playbackRate,
    isVideo, isYouTube, isVisual,
    countInfo, phraseMap, effectiveBeats, currentBpm,

    togglePlay, seekTo, setPlaybackRate,
    handleSkipBack, handleSkipForward,

    gridProps: { /* PhraseGrid에 바로 spread */ },
    headerProps: { /* PlayerHeader에 spread */ },
    seekProps: { /* SeekSection에 spread */ },
    controlProps: { /* PlaybackControlBar에 spread */ },
  };
}
```

---

## 9. 핵심 훅: usePlayerMode

```typescript
// hooks/usePlayerMode.ts (~80줄)
// 모드 세그먼트 [🔢|👥] 상태 관리

type PlayerMode = 'grid-view' | 'grid-edit' | 'form-view' | 'form-edit';

export function usePlayerMode() {
  const [mode, setMode] = useState<PlayerMode>('grid-view');

  const isEdit = mode.endsWith('-edit');
  const isFormation = mode.startsWith('form-');
  const isGridView = mode === 'grid-view';
  const isGridEdit = mode === 'grid-edit';
  const isFormView = mode === 'form-view';
  const isFormEdit = mode === 'form-edit';

  // 🔢 Grid 버튼
  const onGridTap = useCallback(() => setMode('grid-view'), []);
  const onGridLongPress = useCallback(() => setMode('grid-edit'), []);

  // 👥 Formation 버튼
  const onFormTap = useCallback(() => setMode('form-view'), []);
  const onFormLongPress = useCallback(() => setMode('form-edit'), []);

  // 세그먼트 시각 상태
  const gridSegState = isGridView ? 'view' : isGridEdit ? 'edit' : 'inactive';
  const formSegState = isFormView ? 'view' : isFormEdit ? 'edit' : 'inactive';

  return {
    mode, setMode,
    isEdit, isFormation,
    gridSegState, formSegState,
    onGridTap, onGridLongPress,
    onFormTap, onFormLongPress,
  };
}
```

---

## 10. 핵심 컴포넌트: ModeSegment

```typescript
// components/player/ModeSegment.tsx (~100줄)
// 롱프레스 제스처 세그먼트 [🔢 | 👥]

const LONG_PRESS_DURATION = 500; // ms

export function ModeSegment({ gridState, formState, onGridTap, onGridLongPress, onFormTap, onFormLongPress, formDisabled }) {
  // PanResponder 또는 Pressable의 onLongPress 사용
  // React Native의 Pressable 컴포넌트가 onPress + onLongPress를 네이티브 지원

  return (
    <View style={styles.segment}>
      <Pressable
        onPress={onGridTap}
        onLongPress={onGridLongPress}
        delayLongPress={LONG_PRESS_DURATION}
        style={[styles.segBtn, segBgStyle(gridState)]}
      >
        <Text>🔢</Text>
        {gridState !== 'inactive' && <View style={[styles.dot, dotStyle(gridState)]} />}
      </Pressable>

      <Pressable
        onPress={onFormTap}
        onLongPress={onFormLongPress}
        delayLongPress={LONG_PRESS_DURATION}
        disabled={formDisabled}
        style={[styles.segBtn, segBgStyle(formState), formDisabled && styles.disabled]}
      >
        <Text>👥</Text>
        {formState !== 'inactive' && <View style={[styles.dot, dotStyle(formState)]} />}
      </Pressable>
    </View>
  );
}

// 색상 매핑
function segBgStyle(state) {
  if (state === 'view') return { backgroundColor: 'rgba(3,218,198,0.2)' };  // teal
  if (state === 'edit') return { backgroundColor: 'rgba(187,134,252,0.25)' }; // purple
  return {};
}
function dotStyle(state) {
  if (state === 'view') return { backgroundColor: '#03DAC6' };
  if (state === 'edit') return { backgroundColor: '#BB86FC' };
  return {};
}
```

---

## 11. 모드 전환: player.tsx 라우터

```typescript
// app/(tabs)/player.tsx (~50줄)

import { usePlayerMode } from '../../hooks/usePlayerMode';
import { AudioViewScreen } from '../../screens/player/AudioViewScreen';
import { AudioGridEditScreen } from '../../screens/player/AudioGridEditScreen';
import { AudioFormViewScreen } from '../../screens/player/AudioFormViewScreen';
import { AudioFormEditScreen } from '../../screens/player/AudioFormEditScreen';
import { VideoViewScreen } from '../../screens/player/VideoViewScreen';
import { VideoGridEditScreen } from '../../screens/player/VideoGridEditScreen';

export default function PlayerScreen() {
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const { mode } = usePlayerMode();

  const isVisual = currentTrack?.mediaType === 'video' || currentTrack?.mediaType === 'youtube';

  if (isVisual) {
    // 비디오: grid-view → VideoView, grid-edit → VideoGridEdit
    // (form 모드는 비디오에서 자동으로 grid로 fallback)
    return mode === 'grid-edit'
      ? <VideoGridEditScreen />
      : <VideoViewScreen />;
  }

  switch (mode) {
    case 'grid-view':  return <AudioViewScreen />;
    case 'grid-edit':  return <AudioGridEditScreen />;
    case 'form-view':  return <AudioFormViewScreen />;
    case 'form-edit':  return <AudioFormEditScreen />;
    default:           return <AudioViewScreen />;
  }
}
```

---

## 12. 작업 순서 (Phase별)

### Phase 1: 공유 인프라 (먼저)
1. `usePlayerMode.ts` 훅 생성 — 모드 상태 관리
2. `usePlayerCore.ts` 훅 추출 — player.tsx 로직 → 훅으로
3. `useAutoSave.ts` 훅 생성 — 자동저장 로직
4. `components/player/` 공유 컴포넌트 추출:
   - `PlayerHeader.tsx` — [S●] 인디케이터 + ⚙️ 포함
   - `ModeSegment.tsx` — [🔢|👥] 롱프레스 세그먼트
   - `PlaybackControlBar.tsx` — ModeSegment 포함 컨트롤바
   - `SettingsModal.tsx` — ⚙️ 바텀시트
   - `SeekSection.tsx`, `CountDisplay.tsx`, `MarqueeTitle.tsx`
   - `LoopControls.tsx`, `PlayerModals.tsx`, `FocusModeOverlay.tsx`

### Phase 2: 오디오 화면 분리
5. `AudioViewScreen.tsx` 구현 (가장 단순)
6. `AudioGridEditScreen.tsx` 구현
7. `player.tsx`에서 오디오 Grid 모드 2개 분기 → 화면 위임
8. **테스트**: 오디오 재생/편집 정상 동작 확인

### Phase 3: 포메이션 분리
9. `FormationStageView.tsx` 분리:
   - `FormationStageViewer.tsx` (보기 전용 애니메이션)
   - `FormationStageEditor.tsx` (드래그 편집 + [🎯 배치])
   - `FormationToolsModal.tsx` (패턴/프리셋/댄서수)
   - `DancerBox.tsx`
   - `formationPatterns.ts`
10. `useFormationEditor.ts` 훅 추출
11. `AudioFormViewScreen.tsx` 구현
12. `AudioFormEditScreen.tsx` 구현

### Phase 4: 비디오 화면 분리
13. `useVideoControls.ts` 훅 추출 (collapse/expand/fullscreen)
14. `VideoSection.tsx` 컴포넌트 추출
15. `VideoViewScreen.tsx` 구현
16. `VideoGridEditScreen.tsx` 구현

### Phase 5: 정리 및 마무리
17. 기존 `player.tsx` → 50줄 라우터로 교체
18. 기존 `FormationStageView.tsx` 삭제
19. `EditionPicker`, `DraftActions`, `BeatOffsetRow` 제거
20. 소형 화면 테스트 및 레이아웃 조정

---

## 13. 줄 수 예상 비교

### Before
| 파일 | 줄 수 |
|------|------|
| player.tsx | 2,797 |
| FormationStageView.tsx | 1,765 |
| **합계** | **4,562** |

### After
| 파일 | 예상 줄 수 |
|------|-----------|
| player.tsx (라우터) | ~50 |
| **Hooks** | |
| usePlayerCore.ts | ~500 |
| usePlayerMode.ts | ~80 |
| useFormationEditor.ts | ~200 |
| useAutoSave.ts | ~60 |
| useVideoControls.ts | ~150 |
| useFocusMode.ts | ~80 |
| **Screens** | |
| AudioViewScreen.tsx | ~250 |
| AudioGridEditScreen.tsx | ~300 |
| AudioFormViewScreen.tsx | ~280 |
| AudioFormEditScreen.tsx | ~320 |
| VideoViewScreen.tsx | ~250 |
| VideoGridEditScreen.tsx | ~300 |
| **Player Components** | |
| PlayerHeader.tsx | ~100 |
| PlaybackControlBar.tsx | ~150 |
| ModeSegment.tsx | ~100 |
| SettingsModal.tsx | ~150 |
| SeekSection.tsx | ~80 |
| LoopControls.tsx | ~60 |
| CountDisplay.tsx | ~60 |
| MarqueeTitle.tsx | ~60 |
| VideoSection.tsx | ~200 |
| TapTempoPanel.tsx | ~80 |
| PlayerModals.tsx | ~150 |
| FocusModeOverlay.tsx | ~50 |
| **Formation Components** | |
| FormationStageViewer.tsx | ~250 |
| FormationStageEditor.tsx | ~300 |
| FormationToolsModal.tsx | ~250 |
| DancerBox.tsx | ~200 |
| formationPatterns.ts | ~200 |
| **합계** | **~4,960** |

### 핵심 지표
| 지표 | Before | After |
|------|--------|-------|
| 최대 파일 크기 | 2,797줄 | ~500줄 (usePlayerCore) |
| 화면당 최대 | 2,797줄 | ~320줄 |
| View 모드 불필요 로드 | 편집 UI 전부 | 0 |
| 소형폰 그리드 행 (Edit) | ~4행 | ~7행 |
| 소형폰 그리드 행 (View) | ~5행 | ~8행 |

---

## 14. 주의사항

1. **usePlayerCore는 한 번에 추출하지 말 것** — 기존 player.tsx에서 점진적으로 로직을 옮기면서 각 단계마다 동작 확인
2. **ModeSegment 롱프레스** — React Native의 `Pressable` 컴포넌트가 `onLongPress` + `delayLongPress`를 네이티브 지원하므로 PanResponder 불필요
3. **자동저장 디바운스** — 너무 빈번한 저장 방지를 위해 500ms 디바운스 적용
4. **비디오 모드에서 👥 비활성** — 비디오는 Formation을 지원하지 않으므로 세그먼트에서 disabled 처리
5. **기존 스타일 유지** — UI 프레임워크 변경 없음. `StyleSheet.create()` + `constants/theme.ts` 그대로
6. **settingsStore의 playerEditMode** — 기존 editMode를 usePlayerMode 훅으로 관리하도록 전환. settingsStore와 동기화 필요
