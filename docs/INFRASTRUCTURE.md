# Ritmo Infrastructure Reference

## Servers

### jinserver (Ubuntu, 메인 분석/API 서버)
- **고정IP**: 112.169.106.66 (KT 1Gbps)
- **Tailscale**: 100.68.25.79
- **SSH**: `ssh jinserver` (key: ~/.ssh/id_jinserver, port 2222 for external)
- **API**: https://api.ritmo.kr → nginx → localhost:3900 (FastAPI)
- **SSL**: Let's Encrypt, 자동갱신, 만료 2026-06-16
- **NVMe**: /mnt/nvme (분석 캐시, 다운로드, 배치 데이터)

### Mac Mini M4 Pro (분석 병렬 처리 + openClaw)
- **호스트명**: Lees-Mac-mini.local
- **Tailscale**: 100.117.31.13
- **SSH**: `ssh -i ~/.ssh/id_jinserver jinwoo@100.117.31.13`
- **RAM**: 24GB, **NVMe**: 1TB (772GB 여유)
- **Worker**: ~/musicality-worker/ (분석 스크립트, 로컬 DB)

### MacBook Pro M4 Pro (개발 머신)
- **호스트명**: jinmbp.local
- **용도**: 코딩, 빌드 (Xcode/Android Studio), Expo dev server

### Vultr VPS
- **IP**: 158.247.225.152
- **용도**: ritmo.kr 웹사이트 호스팅 (Next.js + nginx)
- **SSH**: `sshpass -p 'password' ssh root@158.247.225.152`

### Synology NAS (jinas)
- **Tailscale**: 100.115.194.12
- **SSH**: `ssh jinas` (key: ~/.ssh/id_jinas)
- **마운트**: /Volumes/Things (맥북에서 SMB)

## API Keys & Secrets

| 서비스 | 키 | 위치 |
|--------|-----|------|
| **Supabase URL** | `https://gcrlzzbyxclswryauuwz.supabase.co` | app: `lib/supabase.ts`, server: `.env` |
| **Supabase Anon Key** | `eyJhbG...` (공개, 클라이언트용) | app: `lib/supabase.ts` |
| **Supabase Service Key** | (비공개, 서버 전용) | server: `.env` only |
| **AcoustID** | `5urpeh7f0F` | server: `.env` → `os.getenv()` |
| **Spotify Client ID** | `586f95f3c3064fb981b48b76239fa765` | 미사용 (quota 제한) |
| **EAS Project ID** | `e1d7a456-edab-43d8-adbe-9ce0c1fb04a3` | `app.json` |

## App Configuration

| 설정 | 값 | 파일 |
|------|-----|------|
| API Base URL | `https://api.ritmo.kr` | `musicality-app/constants/config.ts` |
| Analysis Timeout | 300,000ms (5분) | `musicality-app/constants/config.ts` |
| Bundle ID (iOS) | `kr.ritmo.musicality` | `app.json` |
| Bundle ID (Android) | `com.ongocompany.musicality` | `app.json` |
| App Version | 0.9.0 | `app.json` |

## Batch Analysis Pipeline

### jinserver
```
/mnt/nvme/batch_analyze/
├── pending/    ← yt-dlp 다운로드 진행중
├── ready/      ← 다운로드 완료, 분석 대기
├── done/       ← 분석 완료
└── rejected/   ← BPM 범위 밖
```
- DB: `/home/jinwoo/musicality/server/analysis_cache.db`
- Script: `scripts/batch_pipeline.py --analyze`

### Mac Mini
```
~/musicality-worker/
├── pending/    ← 분석 대기
├── done/       ← 분석 완료
├── rejected/   ← BPM 범위 밖
└── analysis_cache.db  ← 로컬 결과
```
- Script: `scripts/mac_worker_local.py`
- Sync: `scp -P 2222 analysis_cache.db jinwoo@112.169.106.66:/mnt/nvme/batch_analyze/mac_mini_cache.db`

## Monitoring Commands

```bash
# jinserver 분석 진행
ssh jinserver "tail -5 /mnt/nvme/analyze_clean_log.txt"

# 맥미니 분석 진행
ssh -i ~/.ssh/id_jinserver jinwoo@100.117.31.13 "tail -5 ~/analyze_log.txt"

# jinserver DB 현황
ssh jinserver 'cd /home/jinwoo/musicality/server && venv/bin/python3 -c "
import sqlite3; conn = sqlite3.connect(\"analysis_cache.db\")
print(conn.execute(\"SELECT COUNT(*) FROM analysis_cache\").fetchone()[0])
"'

# 맥미니 DB 현황
ssh -i ~/.ssh/id_jinserver jinwoo@100.117.31.13 'cd ~/musicality-worker && venv/bin/python3 -c "
import sqlite3; conn = sqlite3.connect(\"analysis_cache.db\")
print(conn.execute(\"SELECT COUNT(*) FROM analysis_cache\").fetchone()[0])
"'
```
