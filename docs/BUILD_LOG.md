# Ritmo Build Log

## Version History

| Date | Version | Build# | Platform | Changes |
|------|---------|--------|----------|---------|
| 2026-03-19 | 0.9.0 | 1 | Android | Initial release build |
| 2026-03-20 | 0.9.0 | 2 | Android | Community features, i18n |
| 2026-03-22 | 0.9.0 | 2 | iOS | First TestFlight external testing submission |
| 2026-03-23 | 0.9.0 | 3 | Android | Library search filter, SDK setup |
| 2026-03-24 | 0.9.0 | 4 | Android | Community crew search (songs + board) |
| 2026-03-25 | 0.9.0 | 5 | Android | Fix fingerprint mapping, song thread fingerprint |
| 2026-03-25 | 0.9.0 | 6 | Android | Multi-file import (max 10), fingerprint fix |
| 2026-03-25 | 0.9.0 | 7 | Android | Song title on count area, play state fix, library glow style |
| 2026-03-26 | 0.9.0 | 8 | Android | Dancer long-press 1500ms, Spotify album art auto-fetch, fingerprint cache 500 |
| 2026-03-26 | 0.9.0 | 9 | Android | Gold theme, custom icons, beat sync fix, audio focus DoNotMix, song thread delete |
| 2026-03-27 | 0.9.0 | 10 | Android (APK+AAB) | Rainbow color restore, edit undo memory leak fix, library long-press custom modal, new package com.ongocompany.ritmo, release signing config plugin |
| 2026-03-27 | 0.9.0 | 11 | Android (APK+AAB) | Cloud Library (dedup storage, auto-sync, cloud register, 192kbps conversion) |
| 2026-03-27 | 0.9.0 | 12 | Android (APK+AAB) | Cloud sync fixes (album art, Ⓟ badge, race condition), YouTube edition sync, YouTube player track switch fix, remove library management UI |
| 2026-03-28 | 0.9.0 | 13 | Android (APK+AAB) | Remove CAMERA/RECORD_AUDIO permissions, account deletion page, static pages |
| 2026-03-29 | 0.9.0 | 14 | Android (APK+AAB) | Fix grid ghost artifacts, beat counter freeze (analysis→file persist), crew thread duplicate prevention, safer thread deletion |

## Notes

- iOS buildNumber와 Android versionCode는 동기화 유지
- TestFlight/Play Store는 buildNumber로 빌드를 구분 (같은 version이어도 buildNumber가 달라야 업로드 가능)
- 빌드 시 자동으로 buildNumber +1 (CLAUDE.md 규칙)
