-- user_editions: 개인 에디션 서버 동기화
-- fingerprint 기반 매칭 — 기기 변경 시 자동 복원

CREATE TABLE IF NOT EXISTS user_editions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  edition_type text NOT NULL CHECK (edition_type IN ('phrase', 'formation')),
  slot_id text NOT NULL CHECK (slot_id IN ('1', '2', '3')),
  edition_data jsonb NOT NULL,
  cell_notes jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (user_id, fingerprint, edition_type, slot_id)
);

-- RLS 활성화
ALTER TABLE user_editions ENABLE ROW LEVEL SECURITY;

-- 본인 데이터만 접근 가능
CREATE POLICY "Users can manage own editions"
  ON user_editions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 인덱스
CREATE INDEX idx_user_editions_lookup
  ON user_editions (user_id, fingerprint);
