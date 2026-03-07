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

### 다음 마일스톤: M1 (비트 분석 파이프라인)
- Python FastAPI 서버 구축
- Madmom + Librosa 비트/다운비트 감지
- 클라이언트 ↔ 서버 분석 요청/응답 연동
