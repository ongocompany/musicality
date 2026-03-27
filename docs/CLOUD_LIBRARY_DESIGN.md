# Cloud Library 설계서

## 1. 개요

사용자의 음악 라이브러리를 클라우드에 저장하여 앱 삭제/폰 교체 시 복원 가능하게 하는 기능.
서버에 이미 존재하는 곡(6600곡+)은 fingerprint 매칭으로 중복 저장 없이 재활용.

### 핵심 원칙
- **기존 기능 유지**: 무료 사용자는 로컬 저장만 (변경 없음)
- **유료 전용**: 베타 기간은 전체 개방, 정식 서비스 시 프리미엄 기능
- **Dedup**: fingerprint 기반 중복 제거, 동일 곡은 서버에 1개만 저장
- **용량 제한**: 사용자당 1000곡, 서버 저장 시 192kbps로 자동 변환

### 스토리지 예상
| 항목 | 수치 |
|------|------|
| 곡당 평균 크기 | ~4.5MB (192kbps 변환 후) |
| 사용자당 최대 | 1000곡 × 4.5MB = ~4.5GB |
| 서버 고유 곡 예상 | 라틴댄스 특성상 ~5000-8000곡이면 대부분 커버 |
| 서버 총 스토리지 | ~35GB (dedup 후) |
| 기존 분석 캐시 | 6637곡 (fingerprint 완비) |

---

## 2. DB 스키마

### 2-1. cloud_tracks (신규 — 서버 곡 마스터)

fingerprint당 1개. 모든 사용자가 공유하는 곡 메타데이터 + 파일 참조.

```sql
CREATE TABLE cloud_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  file_hash TEXT,                         -- SHA-256 (최초 업로드 파일 기준)
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  album_art_url TEXT,
  duration REAL NOT NULL,                 -- seconds
  bpm REAL,
  format TEXT NOT NULL DEFAULT 'mp3',     -- 저장 포맷 (항상 mp3)
  file_size BIGINT,                       -- 변환 후 크기 (bytes)
  storage_path TEXT,                      -- jinserver 파일 경로 (또는 추후 Supabase Storage)
  -- 분석 데이터 (pnote)
  beats JSONB NOT NULL DEFAULT '[]',
  downbeats JSONB NOT NULL DEFAULT '[]',
  beats_per_bar INT NOT NULL DEFAULT 4,
  confidence REAL NOT NULL DEFAULT 0,
  sections JSONB DEFAULT '[]',
  phrase_boundaries JSONB DEFAULT '[]',
  waveform_peaks JSONB DEFAULT '[]',
  -- 메타
  upload_count INT NOT NULL DEFAULT 0,     -- 몇 명이 이 곡을 갖고 있는지
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cloud_tracks_fingerprint ON cloud_tracks (fingerprint);
CREATE INDEX idx_cloud_tracks_bpm ON cloud_tracks (bpm);
CREATE INDEX idx_cloud_tracks_duration ON cloud_tracks (duration);

-- RLS: 인증된 사용자만 읽기 가능 (쓰기는 서버 service_role만)
ALTER TABLE cloud_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cloud_tracks_read" ON cloud_tracks FOR SELECT USING (auth.role() = 'authenticated');
```

### 2-2. user_library (신규 — 사용자별 소유 매핑)

사용자가 어떤 곡을 갖고 있는지 매핑. cloud_tracks와 N:M 관계.

```sql
CREATE TABLE user_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cloud_track_id UUID NOT NULL REFERENCES cloud_tracks(id) ON DELETE CASCADE,
  -- 사용자별 커스텀 메타
  custom_title TEXT,                      -- 사용자가 변경한 제목 (null이면 cloud_tracks.title 사용)
  folder_id UUID REFERENCES player_folders(id) ON DELETE SET NULL,
  dance_style TEXT NOT NULL DEFAULT 'bachata',
  -- 상태
  is_deleted BOOLEAN NOT NULL DEFAULT false,  -- soft delete (용량 회수)
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, cloud_track_id)
);

CREATE INDEX idx_user_library_user ON user_library (user_id) WHERE NOT is_deleted;
CREATE INDEX idx_user_library_cloud_track ON user_library (cloud_track_id);

ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_library_owner" ON user_library
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

### 2-3. 기존 테이블 변경 없음

`player_tracks`, `track_analyses`, `phrase_editions`, `user_editions` 등
기존 테이블은 그대로 유지. cloud_tracks는 독립된 새 시스템.

---

## 3. Fingerprint 매칭 강화

### 매칭 등급

| 등급 | 조건 | 동작 |
|------|------|------|
| **EXACT** | file_hash 일치 | 기존 MP3 재활용, 즉시 반환 |
| **HIGH** | fingerprint similarity >= 0.9 AND duration ±1초 | 기존 MP3 재활용 |
| **MEDIUM** | fingerprint similarity >= 0.85 AND duration ±2초 AND BPM ±1.0 | 기존 MP3 재활용, 로그 기록 |
| **LOW** | similarity < 0.85 | 별개 곡으로 취급, 새로 저장 |

### 서버 매칭 함수 (analysis_cache.py 수정)

```python
def match_cloud_track(fingerprint: str, duration: float, bpm: float) -> tuple[str, str]:
    """Returns (cloud_track_id, confidence_level) or (None, None)"""
    # 1) fingerprint exact match
    # 2) fingerprint fuzzy match with strengthened criteria
    # 3) BPM cross-validation
```

---

## 4. 플로우

### 4-0. 동기화 방식 (확정)

**일반적인 클라우드 동기화 패턴 채택:**
- 로그인 시 자동 동기화 시작
- 로컬에 있고 cloud에 없는 곡 → 업로드 (분석 여부 관계없이)
- Cloud에 있고 로컬에 없는 곡 → 다운로드
- 양쪽 다 있는 곡 → 스킵 (fingerprint 기반 중복 감지)

**설정 항목:**
- 클라우드 동기화: ON/OFF
- 동기화 네트워크: Wi-Fi만 / Wi-Fi + 모바일데이터

**폴더 동기화:**
- 별도 폴더 테이블 없이 user_library.folder_name으로 태그 방식
- 복원 시 folder_name이 있으면 로컬에 폴더 자동 생성 → 곡 배정
- 폴더 이름 변경/삭제 시 해당 곡들의 folder_name 업데이트

**성능 보장:**
- 백그라운드 동기화 (앱 메인 스레드 차단 없음)
- 한 번에 1곡씩 순차 업로드/다운로드
- 동시 임포트 10곡 제한은 기존과 동일

### 4-1. 임포트 + 분석 (기존 플로우 확장)

```
[앱] 파일 임포트 → 로컬 저장 (기존과 동일)
[앱] POST /analyze (파일 업로드)
[서버] fingerprint 추출
[서버] analysis_cache 확인 (기존 3-tier 캐시)
  ├── cache hit → pnote 반환 (기존과 동일)
  └── cache miss → 분석 실행 → 결과 저장
[서버] cloud_tracks fingerprint 매칭
  ├── 매칭됨 (EXACT/HIGH/MEDIUM) → cloud_track_id 반환
  └── 매칭 안 됨 → MP3를 192kbps 변환 → 저장 → cloud_tracks INSERT
[앱] 응답에 cloud_track_id 포함
[앱] user_library에 등록 (user_id + cloud_track_id)
```

### 4-1b. 백그라운드 동기화 (분석과 무관)

```
[앱] 로그인 또는 앱 포그라운드 진입
[Sync Manager] 네트워크 조건 확인 (Wi-Fi/모바일데이터 설정)
[Sync Manager] 로컬 곡 목록 vs cloud library 비교 (fingerprint)
  ├── 로컬에만 있는 곡 → POST /analyze로 업로드 (분석 + cloud 등록)
  ├── cloud에만 있는 곡 → GET /cloud/download로 다운로드 + 로컬 등록
  └── 양쪽 다 있는 곡 → 메타데이터(folder_name, edition) 동기화
[Sync Manager] 1곡씩 순차 처리, 앱 백그라운드 전환 시 일시정지
```

### 4-2. 라이브러리 복원 (폰 교체/앱 재설치)

```
[앱] 로그인 → cloud library 조회
[앱] 로컬 라이브러리 비어있음 감지
[앱] "클라우드에 N곡 복원 가능" UI 표시
[앱] 네트워크 조건 확인 → 자동 다운로드 시작
[앱] 1곡씩 순차 다운로드: MP3 + analysis + folder 배정
[앱] 중간에 사용자가 임포트해도 fingerprint로 중복 감지 → 충돌 없음
```

### 4-3. 분석 요청 시 서버 응답 변경

기존 응답:
```json
{ "status": "done", "bpm": 128, "beats": [...], ... }
```

확장 응답:
```json
{
  "status": "done",
  "bpm": 128, "beats": [...], ...,
  "cloud_track_id": "uuid-...",
  "match_confidence": "HIGH"
}
```

---

## 5. 서버 API (신규 엔드포인트)

### 5-1. GET /cloud/library
사용자의 클라우드 라이브러리 목록 반환.
```
Authorization: Bearer {supabase_jwt}
Response: [{ cloud_track_id, title, artist, bpm, duration, imported_at, ... }]
```

### 5-2. GET /cloud/download/{cloud_track_id}
MP3 파일 다운로드 (192kbps). 소유권 확인 후 제공.
```
Authorization: Bearer {supabase_jwt}
Response: audio/mpeg stream
```

### 5-3. POST /cloud/register
분석 완료 후 user_library 등록 (앱에서 호출).
```json
{ "cloud_track_id": "uuid-...", "custom_title": "optional" }
```

### 5-4. GET /cloud/restore-info
복원 가능한 곡 목록 (로컬에 없는 곡 판별용).
```
Authorization: Bearer {supabase_jwt}
Response: [{ cloud_track_id, title, artist, bpm, duration, file_size }]
```

---

## 6. 192kbps 변환

### 서버 변환 로직 (ffmpeg)
```bash
ffmpeg -i input.mp3 -b:a 192k -map_metadata 0 output.mp3
```

- 320kbps → 192kbps: 파일 크기 ~40% 감소
- 128kbps 이하: 변환 없이 그대로 저장
- 변환은 서버에서 수행 (분석 후 비동기)

### 저장 경로
```
/data/cloud_audio/{fingerprint_prefix}/{fingerprint}.mp3
```
fingerprint_prefix = fingerprint[:4] (디렉토리 분산)

---

## 7. 구현 순서

### Phase 1: 서버 기반 구축
1. cloud_tracks 테이블 생성 (Supabase)
2. user_library 테이블 생성 (Supabase)
3. 기존 analysis_cache 6637곡 → cloud_tracks 마이그레이션 스크립트
4. 서버: 분석 완료 시 cloud_tracks upsert + MP3 192kbps 변환 저장
5. 서버: fingerprint 매칭 강화 (EXACT/HIGH/MEDIUM/LOW)

### Phase 2: 서버 API
6. GET /cloud/library 엔드포인트
7. GET /cloud/download/{id} 엔드포인트
8. POST /cloud/register 엔드포인트

### Phase 3: 앱 연동
9. analysisApi 응답에 cloud_track_id 처리
10. 분석 완료 시 user_library 자동 등록
11. 라이브러리 복원 UI (설정 탭 or 라이브러리 탭)
12. MP3 다운로드 매니저

### Phase 4: 정식 서비스 준비
13. 구독 상태 체크 (무료/유료 분기)
14. 1000곡 제한 로직
15. 192kbps 변환 사전 공지 UI

---

## 8. 인프라

### 베타 기간 (jinserver)
- MP3 저장: `/data/cloud_audio/` (jinserver 로컬 디스크)
- 예상 용량: ~35GB (dedup 후 8000곡 기준)
- 기존 6637곡은 analysis_cache에서 마이그레이션 (MP3 파일은 재분석 시 확보)

### 정식 서비스 (확장 시)
- Supabase Storage 또는 S3로 마이그레이션
- CDN 적용 (다운로드 속도 개선)

---

## 9. 확정된 정책

- **YouTube 트랙**: MP3 cloud 저장 불필요 (스트리밍이므로). pnote + edition만 클라우드 저장.
- **비디오 파일**: 오디오만 추출하여 192kbps MP3로 저장. 공지: "서버 저장 시 오디오만 추출되며, 변환된 파일은 원본과 분석 결과가 다를 수 있음"
- **Edition 데이터**: phrase/formation 모두 클라우드 저장. 복원 시 함께 복원.
- **기존 uploads/ 임시 파일**: 삭제 (앞으로는 cloud_audio에 자동 저장)
