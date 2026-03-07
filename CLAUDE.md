# Musicality - Claude Code Project Rules

## Project Overview
Latin dance (Bachata/Salsa) auto-count & choreography cue practice player app.

## Tech Stack
- **Frontend**: Expo Managed (SDK 54) + expo-router + TypeScript
- **Audio**: expo-av
- **State**: Zustand
- **Server (planned)**: Python FastAPI + Madmom + Librosa
- **BaaS (planned)**: Supabase

## Git Rules

### Branch Strategy
- `main` branch for primary development (current phase)
- Feature branches when needed in later milestones

### Commit Timing
1. **Milestone complete**: Each milestone (M0, M1, M2...) completion triggers commit + push
2. **Major changes**: Large-scale refactors or significant feature additions
3. **User request**: When user explicitly asks to commit/push

### Commit Message Convention
- Format: `M{n}: {description}` (e.g., `M0: project scaffolding + audio player`)
- Use English for commit messages
- Include Co-Authored-By tag for Claude

### Push Rules
- Push to `main` branch
- Remote: `https://github.com/ongocompany/musicality.git`
- Always verify `git status` before committing
- Never force push to main

## Dance Count Rules

### Bachata (8-count)
- Pattern: step(1)-step(2)-step(3)-TAP(4)-step(5)-step(6)-step(7)-TAP(8)
- BPM range: 125-145 (typical), 100-160 (allowed)
- Music structure: Derecho(verse) / Majao(chorus) / Mambo(bridge)

### Salsa (8-count)
- On1: 1,2,3,(pause4),5,6,7,(pause8) - break on 1
- On2: 1,2,3,(pause4),5,6,7,(pause8) - break on 2
- BPM range: 150-220 (typical)

## Development Notes
- Use `--legacy-peer-deps` for npm install (react-dom peer dep conflict)
- Custom SeekBar uses pageX coordinates (not locationX) to avoid jumping
- expo-av seek operations wrapped in try-catch for "Seeking interrupted" errors
