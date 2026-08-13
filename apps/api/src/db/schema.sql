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

CREATE TABLE IF NOT EXISTS reps (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  initials   TEXT NOT NULL,
  role       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id           UUID REFERENCES deals (id) ON DELETE SET NULL,
  rep_id            UUID NOT NULL REFERENCES reps (id) ON DELETE RESTRICT,
  label             TEXT NOT NULL,
  filename          TEXT,
  duration_seconds  INTEGER NOT NULL DEFAULT 0,
  score             INTEGER,
  verdict           TEXT,
  status_color      TEXT NOT NULL DEFAULT 'neutral',
  status            TEXT NOT NULL DEFAULT 'ready',
  storage_path      TEXT,
  source_url        TEXT,
  analysis          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calls_score_range CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT calls_status_check CHECK (status IN ('queued', 'processing', 'ready', 'failed'))
);

CREATE INDEX IF NOT EXISTS calls_rep_id_idx ON calls (rep_id);
CREATE INDEX IF NOT EXISTS calls_deal_id_idx ON calls (deal_id);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls (created_at DESC);
