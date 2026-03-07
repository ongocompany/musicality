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

### 다음 마일스톤: M2 (카운트 표시 + "지금이 1" 보정)
- 비트맵 기반 실시간 카운트 표시 (1-8)
- 바차타/살사 모드 전환
- 수동 다운비트 보정 UI
