# Musicality Development Log

## Session 2026-03-15

### Milestone M7: i18n (Internationalization)

**Overview**: Full internationalization support for 10 languages with auto device language detection.

**Languages**: KO, EN, JA, ZH-CN, ZH-TW, ES, PT, FR, DE, RU

**Commits**:
- `f1ae67a` M7: i18n support - 10 languages with auto-detection
- `9158549` M7: i18n applied to all remaining screens
- `b511bc3` M7: complete i18n coverage for social components + add missing translation keys

**What was done**:
1. **i18n infrastructure** (`i18n/index.ts`)
   - i18next + react-i18next setup
   - 10 locale JSON files (~185 keys each)
   - `detectDeviceLanguage()` using expo-localization (handles zh-CN vs zh-TW)

2. **Settings integration** (`stores/settingsStore.ts`)
   - `language` field persisted in Zustand store (version 5)
   - `setLanguage()` syncs with i18next

3. **Auto-detection** (`app/_layout.tsx`)
   - First launch: detect device language → persist → apply
   - Returning user: apply persisted language

4. **Login screen** (`app/(auth)/login.tsx`)
   - Language picker grid (10 flags) shown on first visit
   - Language switcher button at bottom of login form
   - All strings via t() calls

5. **All screens converted to t() calls**:
   - `app/(tabs)/_layout.tsx` — tab titles
   - `app/(tabs)/settings.tsx` — all labels, section headers, alerts
   - `app/(tabs)/player.tsx` — analyze, speed, loop, memo, tap instruction
   - `app/(tabs)/community.tsx` — follower/following stats, section titles
   - `components/ui/OnboardingOverlay.tsx` — all slides via titleKey/bulletKeys
   - `components/social/UserProfileCard.tsx` — follower/following labels
   - `components/social/ProfileSlidePanel.tsx` — follower/following labels
   - `components/social/FollowListModal.tsx` — tabs, header, empty states

6. **Translation keys added this session**:
   - `player.nowIsOne` — "지금이 1" / "Now is 1"
   - `player.tapInstruction` — TAP BPM instruction text
   - `community.noFollowers` — empty follower list text
   - `community.noFollowing` — empty following list text

---

### Other fixes completed this session (pre-M7):

| Commit | Description |
|--------|-------------|
| `a68fde6` | Grid UX: replace "Start new phrase" with "Re-arrange phrases" |
| `11f3823` | Fix: grid re-render after phrase split/re-arrange |
| `d223ae4` | Fix: scroll to action cell after split/re-arrange/merge |
| `c29e2ad` | Fix: YouTube fullscreen exit touch capture bug |
| `b684020` | Feature: fullscreen video playback with count overlay |
| `25808d3` | Fix: fullscreen uses same video instance instead of duplicate |
| `7716d6b` | Fix: fullscreen video with separate instance + position sync |
| `2043534` | Fix: fullscreen video audio, counter, and play/pause sync |

**Key fixes**:
- **Fullscreen video**: Resolved dual Video instance conflict by hiding main video during fullscreen, adding separate playback status handler, restoring position on exit
- **Grid editing**: Split Phrase (4-beat cut) + Re-arrange Phrase (move phrase boundary) working with proper re-render
- **Phrase numbering**: Sequential 1,2,3,4 instead of 8-multiple display
- **Tutorial skip**: Logged-in users bypass onboarding overlay
- **Beat transition color hint**: Visual cue for upcoming phrase changes

---

### Known remaining items:
- [ ] Full codebase scan for any remaining hardcoded Korean/English strings
- [ ] library.tsx, messages screens may have untranslated strings
- [ ] Expo server on jinserver may need `--clear` cache restart after locale changes

---

## Session 2026-03-16

### 작업 완료
- **EAS preview 빌드** — development → preview 프로필로 변경 (Metro 서버 불필요)
- **API_BASE_URL 변경** — `jinserver.tail3a2ff1.ts.net` → `api.ritmo.kr` (Cloudflare Tunnel, Tailscale 불필요)
- **곡 분석 알고리즘 향상 계획** — checklist.md 하단에 3단계 로드맵 추가
- **곡 분석 최신 기술 리서치** — Beat This!(ISMIR 2024), BeatNet+, All-In-One, Essentia 등 조사 완료

### 발견된 버그: 유튜브 전체화면 3종

| # | 증상 | 원인 추정 | 심각도 |
|---|------|----------|--------|
| 1 | 전체화면 시 **하단 탭바가 보임** | fullscreen 진입 시 탭바 hide 처리 누락 | Medium |
| 2 | 전체화면 복귀 후 **하단 컨트롤러 먹통**, 유튜브 핸들러만 작동 | YouTube iframe이 터치 이벤트를 가로챔 (z-index/pointer 문제) | High |
| 3 | 다시 전체화면 진입 시 **영상 freeze + 음악만 재생** | iframe 재진입 시 player state 동기화 실패 | High |

**관련 파일**: `hooks/useVideoPlayer.ts`, `app/(tabs)/player.tsx`

### 기타 메모
- 안드로이드 롱프레스 팝업 모달 디자인 개선 필요 (iOS 대비 밋밋함) — 우선순위 낮음
- 곡 분석: 타악기 편성이 흐린 곡에서 beat 감지 불안정 → beat 후처리 + BPM 교차검증 우선 적용 예정
- 서버 로그가 소켓으로 빠져서 확인 불가 → 다음에 로그 파일로 리다이렉트 설정 필요
