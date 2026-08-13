-- Mistri AI schema. Safe to re-run: uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  name             TEXT NOT NULL,
  org              TEXT,
  organization_id  UUID NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  role             TEXT NOT NULL DEFAULT 'OWNER',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('OWNER', 'ADMIN', 'TEAM_MEMBER'))
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'OWNER';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('OWNER', 'ADMIN', 'TEAM_MEMBER'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE RESTRICT;

DO $$
DECLARE r RECORD;
  new_org UUID;
BEGIN
  FOR r IN
    SELECT id, COALESCE(NULLIF(BTRIM(org), ''), 'Organization') AS org_name
    FROM users
    WHERE organization_id IS NULL
  LOOP
    INSERT INTO organizations (name) VALUES (r.org_name) RETURNING id INTO new_org;
    UPDATE users SET organization_id = new_org, org = r.org_name WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS users_organization_id_idx ON users (organization_id);

CREATE TABLE IF NOT EXISTS deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE deals ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;

UPDATE deals d
SET organization_id = u.organization_id
FROM users u
WHERE d.created_by = u.id AND d.organization_id IS NULL;

INSERT INTO organizations (name)
SELECT 'Mistri'
WHERE EXISTS (SELECT 1 FROM deals WHERE organization_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM organizations);

UPDATE deals
SET organization_id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL;
ALTER TABLE deals ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS deals_organization_id_idx ON deals (organization_id);

CREATE TABLE IF NOT EXISTS user_deals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  deal_id    UUID NOT NULL REFERENCES deals (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, deal_id)
);

CREATE INDEX IF NOT EXISTS user_deals_deal_id_idx ON user_deals (deal_id);

-- One deal can have many calls. deal_id is nullable so a call can be mapped later.
CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
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

ALTER TABLE calls ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;

UPDATE calls c
SET organization_id = u.organization_id
FROM users u
WHERE c.uploaded_by = u.id AND c.organization_id IS NULL;

UPDATE calls c
SET organization_id = d.organization_id
FROM deals d
WHERE c.deal_id = d.id AND c.organization_id IS NULL;

INSERT INTO organizations (name)
SELECT 'Mistri'
WHERE EXISTS (SELECT 1 FROM calls WHERE organization_id IS NULL)
  AND NOT EXISTS (SELECT 1 FROM organizations);

UPDATE calls
SET organization_id = (SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1)
WHERE organization_id IS NULL;

ALTER TABLE calls ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS calls_deal_id_idx ON calls (deal_id);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls (created_at DESC);
CREATE INDEX IF NOT EXISTS calls_organization_id_idx ON calls (organization_id);

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
