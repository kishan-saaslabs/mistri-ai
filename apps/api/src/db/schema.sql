-- Mistri AI schema. Safe to re-run: uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  org           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS deals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One deal can have many calls. deal_id is nullable so a call can be mapped later.
CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID REFERENCES deals (id) ON DELETE SET NULL,
  uploaded_by       UUID REFERENCES users (id) ON DELETE SET NULL,
  label             TEXT NOT NULL,
  filename          TEXT,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'processing',
  storage_path      TEXT,
  source_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calls_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS calls_deal_id_idx ON calls (deal_id);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls (created_at DESC);

-- One call can have many transcription rows (retries). segments is a JSON array of objects.
CREATE TABLE IF NOT EXISTS transcriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'pyai',
  model              TEXT NOT NULL DEFAULT 'pyai-hear',
  status             TEXT NOT NULL DEFAULT 'processing',
  language           TEXT,
  duration_seconds   NUMERIC,
  full_text          TEXT,
  segments           JSONB NOT NULL DEFAULT '[]'::jsonb,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transcriptions_status_check CHECK (status IN ('processing', 'ready', 'failed')),
  CONSTRAINT transcriptions_segments_is_array CHECK (jsonb_typeof(segments) = 'array')
);

CREATE INDEX IF NOT EXISTS transcriptions_call_id_idx ON transcriptions (call_id);

