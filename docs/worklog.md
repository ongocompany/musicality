# Musicality - Work Log

## 2026-03-07 | M0: 프로젝트 스캐폴딩 + 오디오 재생

### 완료 작업

#### 1. 프로젝트 초기화
- Expo Managed (SDK 54) + TypeScript 프로젝트 생성
- expo-router 기반 파일 라우팅 설정
- 다크 테마 UI 적용

#### 2. 의존성 설치
- expo ~54.0.0, react 19.1.0, react-native 0.81.5
- expo-av ~16.0.7 (오디오 재생)
- expo-document-picker ~14.0.8 (파일 임포트)
- expo-router ~6.0.23 (파일 기반 라우팅)
- zustand ^5.0.11 (상태관리)
- `--legacy-peer-deps` 사용 (react-dom peer dependency 충돌 해결)

#### 3. 탭 네비게이션
- 3개 탭 구성: Library | Player | Settings
- Ionicons 아이콘 적용
- 다크 테마 컬러 (#0A0A0F 배경)

#### 4. 파일 임포트 기능
- expo-document-picker로 오디오 파일 선택 (mp3, wav, flac, m4a)
- 파일 메타데이터 추출 → Track 타입 변환
- FAB 버튼으로 파일 추가
- 트랙 리스트 표시 + 롱프레스 삭제

#### 5. 오디오 재생
- expo-av Audio.Sound 기반 재생/일시정지
- 실시간 위치 추적 (progressUpdateIntervalMillis: 50ms)
- 커스텀 SeekBar 구현 (터치 + 드래그)
- 재생 속도 조절 (0.5x, 0.75x, 1.0x, 1.25x, 1.5x)
- ±10초 스킵 버튼

#### 6. A-B 구간반복
- A(시작점) / B(끝점) 마커 설정
- 루프 활성화 시 자동 seek back
- SeekBar에 루프 구간 하이라이트 표시
- 루프 해제 버튼

#### 7. 라이브러리 ↔ 플레이어 연동
- 라이브러리에서 트랙 탭 → playerStore에 currentTrack 설정 → Player 탭으로 자동 이동

### 해결한 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| Expo Go 호환 에러 | SDK 55는 App Store Expo Go 미지원 | SDK 54로 다운그레이드 |
| npm peer dep 충돌 | react-dom@19.2.4 vs react@19.1.0 | `--legacy-peer-deps` 사용 |
| @react-native-community/slider 설치 실패 | 동일 peer dep 충돌 | 커스텀 SeekBar(PanResponder) 구현 |
| "Seeking interrupted" 에러 | 빠른 seek 시 expo-av 동시 seek 충돌 | seekingRef 가드 + try-catch |
| SeekBar 스와이프 불가 | PanResponder 클로저에 초기값 고정 | React Responder API로 전환 |
| SeekBar 바가 불특정 구간으로 튐 | locationX가 자식요소 기준으로 바뀜 | pageX 절대좌표 사용 + pointerEvents="none" |

### 생성된 파일

```
musicality-app/
├── app/
│   ├── _layout.tsx
│   └── (tabs)/
│       ├── _layout.tsx
│       ├── index.tsx          # Library
│       ├── player.tsx         # Player
│       └── settings.tsx       # Settings
├── components/ui/
│   └── SeekBar.tsx
├── hooks/
│   └── useAudioPlayer.ts
├── stores/
│   └── playerStore.ts
├── services/
│   └── fileImport.ts
├── types/
│   └── track.ts
├── constants/
│   └── theme.ts
├── index.ts
├── package.json
├── tsconfig.json
└── app.json
```

### 기술 결정 사항
- **Expo Managed SDK 54**: Expo Go 호환성 확보
- **Zustand**: 경량 상태관리, 다중 스토어 패턴
- **커스텀 SeekBar**: 서드파티 슬라이더 대신 직접 구현 (pageX 기반)
- **바차타 8카운트**: step(1)-step(2)-step(3)-TAP(4)-step(5)-step(6)-step(7)-TAP(8)

---

## 2026-03-07 | M1: 비트 분석 파이프라인

### 완료 작업

#### 1. Python FastAPI 서버 (`server/`)
- FastAPI 앱 + CORS + `/health` 헬스체크
- `POST /analyze` 엔드포인트: 파일 업로드 → 분석 → JSON 응답
- 파일 타입 검증 (mp3, wav, flac, m4a, aac, ogg), 100MB 제한
- 임시파일 자동 정리

#### 2. 비트 분석 엔진 (`server/services/beat_analyzer.py`)
- Madmom RNNBeatProcessor + DBNBeatTrackingProcessor (비트 감지)
- Madmom RNNDownBeatProcessor + DBNDownBeatTrackingProcessor (다운비트 감지)
- Librosa BPM 추정 + duration 계산
- 비트 규칙성 기반 confidence 점수 산출
- 다운비트 감지 실패 시 fallback (매 4번째 비트)

#### 3. 응답 스키마 (`server/models/schemas.py`)
- AnalysisResult: bpm, beats[], downbeats[], duration, beats_per_bar, confidence

#### 4. 클라이언트 분석 서비스
- `services/analysisApi.ts`: analyzeTrack(), checkServerHealth()
- `constants/config.ts`: API_BASE_URL, ANALYSIS_TIMEOUT_MS
- `types/analysis.ts`: AnalysisResult, AnalysisStatus 타입
- `types/track.ts`: analysis, analysisStatus 필드 추가

#### 5. Store 확장
- setTrackAnalysisStatus(): 분석 상태 변경 (idle/analyzing/done/error)
- setTrackAnalysis(): 분석 결과 저장 (tracks[] + currentTrack 동시 업데이트)

#### 6. UI 변경
- **Library 탭**: 분석 상태 배지 (BPM/로딩/에러), 분석 버튼 (analytics 아이콘)
- **Player 탭**: "Analyze Beats" 버튼, BPM 배지 + confidence 표시, 분석중 로딩
- **Settings 탭**: 서버 연결 상태 (온라인/오프라인), 서버 URL 표시, 새로고침 버튼

### 생성된 파일

```
server/
├── main.py                    # FastAPI 앱
├── routers/
│   ├── __init__.py
│   └── analysis.py            # /analyze 엔드포인트
├── services/
│   ├── __init__.py
│   └── beat_analyzer.py       # Madmom + Librosa 분석
├── models/
│   ├── __init__.py
│   └── schemas.py             # Pydantic 스키마
├── requirements.txt
├── .env.example
└── README.md

musicality-app/ (추가/수정)
├── services/analysisApi.ts    # 신규
├── types/analysis.ts          # 신규
└── constants/config.ts        # 신규
```

### 서버 배포 환경
- **서버**: jinwoo@jinserver (Ubuntu, Tailscale)
- **실행**: `uvicorn main:app --host 0.0.0.0 --port 8000`
- **의존성**: madmom, librosa, fastapi, uvicorn, python-multipart

---

### 서버 포트 변경
- 8000 → 3900 (다른 프로젝트와 충돌 방지)
- `server/main.py`, `musicality-app/constants/config.ts` 수정

---

## 2026-03-07 | M2: 카운트 표시 + "지금이 1" 보정

### 완료 작업

#### 1. 비트 카운팅 엔진 (`utils/beatCounter.ts`)
- 순수 함수 모듈 (React 의존성 없음)
- 타입: `DanceStyle`, `BeatType`, `CountInfo`
- `findCurrentBeatIndex()` — 이진탐색 O(log n)으로 현재 비트 찾기
- `findNearestBeatIndex()` — 가장 가까운 비트 스냅 (보정용)
- `computeReferenceIndex()` — 다운비트/오프셋 기반 "비트 1" 기준점
- `getBeatType()` — 댄스 스타일별 비트 타입 결정
- `getCountInfo()` — 메인 진입점, position → CountInfo 변환
- 카운트 공식: `((currentIdx - refIdx) % 8 + 8) % 8 + 1`

#### 2. 설정 스토어 (`stores/settingsStore.ts`)
- Zustand 스토어 (playerStore 패턴)
- `danceStyle: DanceStyle` (기본값 'bachata')
- `downbeatOffsets: Record<string, number>` — 트랙별 다운비트 보정 인덱스
- `setDanceStyle`, `setDownbeatOffset`, `clearDownbeatOffset`

#### 3. 카운트 표시 컴포넌트 (`components/ui/CountDisplay.tsx`)
- 큰 숫자 72px (fontWeight 800, fontVariant tabular-nums)
- 비트 타입 라벨: "STEP" / "TAP" / "PAUSE"
- 색상: step = #BB86FC (보라), tap/pause = #FF9800 (주황)
- 분석 없으면 "--" + 안내 메시지 표시

#### 4. Settings 탭 수정
- 댄스 스타일 라디오 버튼 선택기 (기존 Coming Soon → 활성)
- Bachata ("1-2-3-TAP-5-6-7-TAP"), Salsa On1, Salsa On2
- 버전 "1.0.0 (M2)" 업데이트

#### 5. Player 탭 수정
- CountDisplay + "지금이 1" 버튼 통합 (트랙헤더 ↔ SeekBar 사이)
- `getCountInfo()` 매 렌더 호출 (50ms 주기, O(log n) — 성능 OK)
- "지금이 1": `findNearestBeatIndex` → `setDownbeatOffset`
- ScrollView로 컨텐츠 래핑

### 생성된 파일

```
musicality-app/ (추가/수정)
├── utils/
│   └── beatCounter.ts            # 신규 — 비트 카운팅 순수 함수
├── stores/
│   └── settingsStore.ts          # 신규 — 댄스 스타일 + 오프셋 스토어
├── components/ui/
│   └── CountDisplay.tsx          # 신규 — 카운트 시각화 컴포넌트
├── app/(tabs)/
│   ├── player.tsx                # 수정 — CountDisplay + 지금이 1
│   └── settings.tsx              # 수정 — 댄스 스타일 선택기
└── constants/
    └── theme.ts                  # 수정 — beatPulse, tapAccent 색상 추가
```

### 기술 결정 사항
- **이진탐색**: 비트 배열에서 O(log n) 탐색, 50ms 업데이트 주기에서 성능 문제 없음
- **순수 함수 분리**: beatCounter.ts에 React 의존성 없는 유틸리티로 분리 → 테스트 용이
- **8카운트 모듈러**: `((idx - ref) % 8 + 8) % 8 + 1` — 음수 인덱스도 정상 처리
- **트랙별 오프셋**: downbeatOffsets를 트랙 ID 키로 관리, 각 곡마다 독립 보정

---

### 다음 마일스톤: M3 (큐 시스템)
- 비트별 클릭음/비프음 재생
- TTS 음성 카운트
- 큐 볼륨 조절 + 타입 선택 UI

---

## 2026-03-15 | M4~M7: 그리드 편집 + 영상 + 커뮤니티 + i18n

### M4: 비트 그리드 + 프레이즈 노트

#### 완료 작업
- Split Phrase: 현재 셀 기준 4박 단위 프레이즈 분할
- Re-arrange Phrase: 프레이즈 경계 이동 (Start New Phrase 대체)
- 프레이즈 첫 열 번호 순차 표시 (1,2,3,4... 기존 8배수 → 순번)
- 그리드 편집 후 리렌더 버그 수정
- 편집 후 액션 셀로 자동 스크롤

### M5: 영상 모드 + 유튜브 오버레이

#### 완료 작업
- 전체 화면 비디오 재생 + 카운트 오버레이
- 듀얼 Video 인스턴스 충돌 해결 (메인 비디오 숨김 방식)
- 전체 화면 ↔ 일반 모드 전환 시 오디오/포지션/재생상태 완벽 유지
- YouTube 전체 화면 exit 후 터치 캡처 버그 수정

#### 해결한 이슈

| 이슈 | 원인 | 해결 |
|------|------|------|
| 전체 화면 오디오 안 나옴 | 듀얼 Video 인스턴스 동시 로드 | 전체 화면 시 메인 비디오 `!isFullScreen` 조건부 렌더 |
| 전체 화면 카운터 깜빡임 | 전체 화면 Video에 onPlaybackStatusUpdate 미등록 | onFullscreenPlaybackStatus 콜백 추가 |
| 전체 화면 종료 후 위치 초기화 | 메인 비디오 재마운트 시 position 0 | savedPositionRef + onMainVideoLoad 복원 |
| YouTube 전체 화면 exit 후 터치 불가 | WebView 이벤트 캡처 잔류 | 전체 화면 state 리셋 처리 |

### M6: 커뮤니티 + 소셜
- (이전 세션에서 완료 — Supabase 인증, 프로필, 팔로우, 크루 시스템 등)

### M7: 국제화 (i18n)

#### 완료 작업

##### 인프라
- `i18n/index.ts`: i18next + react-i18next 설정
- 10개 언어: KO, EN, JA, ZH-CN, ZH-TW, ES, PT, FR, DE, RU
- `detectDeviceLanguage()`: expo-localization 기반, zh-CN/zh-TW 자동 구분
- `stores/settingsStore.ts`: language 필드 영속화 (v5)
- `app/_layout.tsx`: 첫 실행 자동 감지 → 영속화

##### 변환된 화면 (전체 t() 호출)
- `app/(auth)/login.tsx` — 언어 선택 그리드 (10개 플래그)
- `app/(tabs)/_layout.tsx` — 탭 타이틀
- `app/(tabs)/settings.tsx` — 전체 라벨/헤더/알럿
- `app/(tabs)/player.tsx` — 분석, 속도, 반복, 메모, 탭 인스트럭션
- `app/(tabs)/community.tsx` — 팔로워/팔로잉 통계
- `components/ui/OnboardingOverlay.tsx` — 전 슬라이드
- `components/social/UserProfileCard.tsx` — 팔로워/팔로잉
- `components/social/ProfileSlidePanel.tsx` — 팔로워/팔로잉
- `components/social/FollowListModal.tsx` — 탭/헤더/빈 상태

##### 번역 키
- 185+ 키 × 10개 언어 = 1,850+ 번역 문자열
- 추가 키: `player.nowIsOne`, `player.tapInstruction`, `community.noFollowers`, `community.noFollowing`

#### 커밋 이력

| 커밋 | 설명 |
|------|------|
| `a68fde6` | Grid UX: replace "Start new phrase" with "Re-arrange phrases" |
| `11f3823` | Fix: grid re-render after phrase split/re-arrange |
| `d223ae4` | Fix: scroll to action cell after split/re-arrange/merge |
| `c29e2ad` | Fix: YouTube fullscreen exit touch capture bug |
| `b684020` | Feature: fullscreen video playback with count overlay |
| `25808d3` | Fix: fullscreen uses same video instance instead of duplicate |
| `7716d6b` | Fix: fullscreen video with separate instance + position sync |
| `2043534` | Fix: fullscreen video audio, counter, and play/pause sync |
| `f1ae67a` | M7: i18n support - 10 languages with auto-detection |
| `9158549` | M7: i18n applied to all remaining screens |
| `b511bc3` | M7: complete i18n coverage for social components |
| `1e2ed86` | Add DEVLOG.md with session summary |

### 기술 결정 사항
- **i18next**: React Native에서 가장 성숙한 i18n 라이브러리, react-i18next 바인딩
- **expo-localization**: 기기 언어 감지 + zh-CN/zh-TW 구분 (region 기반)
- **전체 화면 비디오**: Modal 대신 absolute positioning + 메인 비디오 조건부 렌더 (듀얼 인스턴스 충돌 회피)
- **EQ 기능 취소**: M4(구 계획)의 EQ 프리셋은 구현하지 않기로 결정
