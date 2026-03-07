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

## Milestones

### Completed
- **M0**: Project scaffolding + audio player
- **M1**: Beat analysis pipeline (FastAPI + Madmom + client integration)
- **M2**: Count display + "지금이 1" downbeat correction
- **M3**: Music structure analysis + section display + cue system (client-side)

### In Progress (main branch)
- **M3.5**: Structure analysis algorithm improvement
  - Beat-synchronous features (v2.1)
  - Classification tuning (derecho/majao/mambo accuracy)
  - Multi-song batch testing & rule refinement
  - Goal: reliable intro→derecho boundary for auto-count start

### Planned (separate branches)
- **M-labeling** (`feature/labeling-tool`): Section labeling tool for algorithm training
  - App UI: labeling mode (tap to mark section boundaries during playback)
  - Server: labeled data storage + analysis accuracy comparison
  - Semi-automatic: analyzer suggests → user corrects → data accumulates
  - NOT consumer-facing — internal tool for algorithm improvement
- **M4**: Cue system (sound assets + cue playback hook)
- **M5**: YouTube overlay mode (tap tempo + manual sync)

## Development Notes
- Use `--legacy-peer-deps` for npm install (react-dom peer dep conflict)
- Custom SeekBar uses pageX coordinates (not locationX) to avoid jumping
- expo-av seek operations wrapped in try-catch for "Seeking interrupted" errors
- Server: Python FastAPI + uvicorn on jinserver (ssh jinwoo@jinserver, port 3900)
- Structure analyzer: `server/services/structure_analyzer.py` (v2.1 beat-sync)
- Test samples in `samples/` folder, copy to `/tmp/` for curl testing (avoid Korean filenames)
