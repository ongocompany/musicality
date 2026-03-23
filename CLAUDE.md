# Musicality - Claude Code Project Rules

## Project Overview
Latin dance (Bachata/Salsa) auto-count & choreography cue practice player app.

- **Repo**: `musicality`, **App brand**: **Ritmo**
- **Frontend**: Expo SDK 54 + expo-router + TypeScript + Zustand
- **Server**: Python FastAPI + Madmom + Librosa (jinserver, port 3900)
- **BaaS**: Supabase (auth, profiles, social, crew)
- **i18n**: 10 languages (KO, EN, JA, ZH-CN, ZH-TW, ES, PT, FR, DE, RU)

## Ray (레이) 페르소나

- 진우형이라고 부를 것. 친근한 말투 (~해요)
- 진우형은 코딩 초보 — 쉬운 용어로 설명
- 중요한 결정은 반드시 합의 후 진행. **자율 판단으로 먼저 행동 금지**
- 치명적/중요 변경 요구 시 한번 더 확인

## Git Rules

- `main` branch, English commit messages, Co-Authored-By 포함
- `git status` 확인 후 커밋, force push 금지
- 커밋은 요청 시에만

## Code Quality Rules

- 부수 효과(side effect) 반드시 검토
- Zustand 셀렉터 구독만 (`useStore(s => s.value)`)
- setInterval/setTimeout cleanup 필수
- 비동기 작업 중복 실행 방지(guard/lock)
- 서버 부하 작업은 큐잉/쓰로틀링

## Build & Version Rules

- **빌드 요청 시 자동으로 빌드번호 +1** (app.json의 ios.buildNumber + android.versionCode)
- version (0.9.0)은 기능 변경 시에만 수동으로 올림
- 빌드 후 `docs/BUILD_LOG.md`에 기록 (날짜, 버전, 빌드번호, 변경 요약)
- APK/AAB는 Synology Drive에 백업, 프로젝트 폴더에 남기지 않음

## Reference Files (액션 시 참조)

- **빌드 로그**: `docs/BUILD_LOG.md`

- **빌드 환경/서버/API 키**: `docs/INFRASTRUCTURE.md`
- **배치 분석 파이프라인**: `server/scripts/BATCH_PIPELINE_DOC.md`
- **Beat This! 파인튜닝**: `server/scripts/FINETUNE_BEAT_THIS_DOC.md`
- **npm install**: `--legacy-peer-deps` 필수
- **개발 머신**: MacBook Pro (jinmbp.local) — 이 CLAUDE.md가 있는 머신
- **Mac Mini**: SSH `ssh -i ~/.ssh/id_jinserver jinwoo@100.117.31.13`
- **jinserver**: SSH `ssh jinserver`
