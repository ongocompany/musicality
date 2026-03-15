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
