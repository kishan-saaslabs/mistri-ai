-- Mistri AI schema. Safe to re-run: uses IF NOT EXISTS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

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
  status            TEXT NOT NULL DEFAULT 'PROCESSING',
  storage_path      TEXT,
  source_url        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calls_status_check CHECK (status IN ('queued', 'PROCESSING', 'PYAI_SUCCESS', 'PYAI_FAILED'))
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

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_status_check;
UPDATE calls SET status = 'PROCESSING' WHERE status IN ('processing', 'PROCESSING');
UPDATE calls SET status = 'PYAI_SUCCESS' WHERE status IN ('ready', 'PYAI_SUCCESS', 'LLM_TRANSCRIBING', 'LLM_SUCCESS', 'LLM_FAILED');
UPDATE calls SET status = 'PYAI_FAILED' WHERE status IN ('failed', 'PYAI_FAILED');
ALTER TABLE calls ALTER COLUMN status SET DEFAULT 'PROCESSING';
ALTER TABLE calls ADD CONSTRAINT calls_status_check
  CHECK (status IN ('queued', 'PROCESSING', 'PYAI_SUCCESS', 'PYAI_FAILED'));

CREATE INDEX IF NOT EXISTS calls_deal_id_idx ON calls (deal_id);
CREATE INDEX IF NOT EXISTS calls_created_at_idx ON calls (created_at DESC);
CREATE INDEX IF NOT EXISTS calls_organization_id_idx ON calls (organization_id);

-- One call can have many transcription rows (retries). segments is a JSON array of objects.
CREATE TABLE IF NOT EXISTS transcriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  provider           TEXT NOT NULL DEFAULT 'pyai',
  model              TEXT NOT NULL DEFAULT 'pyai-hear',
  status             TEXT NOT NULL DEFAULT 'PROCESSING',
  language           TEXT,
  duration_seconds   NUMERIC,
  full_text          TEXT,
  segments           JSONB NOT NULL DEFAULT '[]'::jsonb,
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transcriptions_status_check CHECK (status IN (
    'PROCESSING',
    'PYAI_TRANSCRIBING',
    'PYAI_SUCCESS',
    'PYAI_FAILED',
    'LLM_TRANSCRIBING',
    'LLM_SUCCESS',
    'LLM_FAILED'
  )),
  CONSTRAINT transcriptions_segments_is_array CHECK (jsonb_typeof(segments) = 'array')
);

ALTER TABLE transcriptions DROP CONSTRAINT IF EXISTS transcriptions_status_check;
UPDATE transcriptions SET status = 'PROCESSING' WHERE status IN ('processing', 'PROCESSING');
UPDATE transcriptions SET status = 'PYAI_SUCCESS' WHERE status IN ('ready', 'PYAI_SUCCESS');
UPDATE transcriptions SET status = 'PYAI_FAILED' WHERE status IN ('failed', 'PYAI_FAILED');
ALTER TABLE transcriptions ALTER COLUMN status SET DEFAULT 'PROCESSING';
ALTER TABLE transcriptions ADD CONSTRAINT transcriptions_status_check
  CHECK (status IN (
    'PROCESSING',
    'PYAI_TRANSCRIBING',
    'PYAI_SUCCESS',
    'PYAI_FAILED',
    'LLM_TRANSCRIBING',
    'LLM_SUCCESS',
    'LLM_FAILED'
  ));

CREATE INDEX IF NOT EXISTS transcriptions_call_id_idx ON transcriptions (call_id);

-- LLM speaker-name inference results for a transcription: the fully
-- resolved named transcript (segments + speakerName) plus the raw
-- InferredSpeaker[] suggestions, cached per transcription_id (not call_id
-- — a call can have multiple transcription rows across retries with
-- different segments, so each retry gets its own inference). call_id is
-- carried directly for convenient querying without joining through
-- transcriptions on every read.
CREATE TABLE IF NOT EXISTS call_transcripts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id            UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  transcription_id   UUID NOT NULL REFERENCES transcriptions (id) ON DELETE CASCADE,
  segments           JSONB NOT NULL,
  inferred_speakers  JSONB NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_transcripts_transcription_id_key UNIQUE (transcription_id)
);

CREATE INDEX IF NOT EXISTS call_transcripts_call_id_idx ON call_transcripts (call_id);

-- LLM-generated call insights (what happened, objections, what the
-- customer wants, next steps, optional follow-up email draft), generated
-- from the NAMED transcript in call_transcripts once speaker-name
-- inference succeeds. Keyed by transcription_id for the same reason as
-- call_transcripts — a retranscription gets its own insights.
-- status lets a row be inserted immediately (PROCESSING) when generation
-- starts, then updated in place as it completes — same pattern as
-- transcriptions.status — rather than only ever appearing once fully done.
CREATE TABLE IF NOT EXISTS call_insights (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id           UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  transcription_id  UUID NOT NULL REFERENCES transcriptions (id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'PROCESSING',
  summary           JSONB NOT NULL DEFAULT '[]'::jsonb,
  objections        JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_wants    JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_steps        JSONB NOT NULL DEFAULT '[]'::jsonb,
  follow_up_email   JSONB,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT call_insights_transcription_id_key UNIQUE (transcription_id),
  CONSTRAINT call_insights_status_check CHECK (status IN ('PROCESSING', 'SUCCESS', 'FAILED'))
);

-- Catch-up for an already-existing table from before status tracking was added.
ALTER TABLE call_insights ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE call_insights ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE call_insights ALTER COLUMN summary SET DEFAULT '[]'::jsonb;
ALTER TABLE call_insights ALTER COLUMN objections SET DEFAULT '[]'::jsonb;
ALTER TABLE call_insights ALTER COLUMN customer_wants SET DEFAULT '[]'::jsonb;
ALTER TABLE call_insights ALTER COLUMN next_steps SET DEFAULT '[]'::jsonb;
-- Any pre-existing row already has real data (it could only have been
-- written by the old upsert-on-success code path), so it's a completed
-- SUCCESS regardless of the column default above.
UPDATE call_insights SET status = 'SUCCESS' WHERE status = 'PROCESSING';
ALTER TABLE call_insights DROP CONSTRAINT IF EXISTS call_insights_status_check;
ALTER TABLE call_insights ADD CONSTRAINT call_insights_status_check
  CHECK (status IN ('PROCESSING', 'SUCCESS', 'FAILED'));

CREATE INDEX IF NOT EXISTS call_insights_call_id_idx ON call_insights (call_id);

-- Knowledge-base ingestion status for a transcription's named transcript:
-- chunking + topic segmentation + embedding, tracked the same way
-- call_insights.status is (PROCESSING/SUCCESS/FAILED), but attached to
-- call_transcripts since ingestion consumes exactly that row's segments.
ALTER TABLE call_transcripts ADD COLUMN IF NOT EXISTS kb_status TEXT NOT NULL DEFAULT 'PROCESSING';
ALTER TABLE call_transcripts DROP CONSTRAINT IF EXISTS call_transcripts_kb_status_check;
ALTER TABLE call_transcripts ADD CONSTRAINT call_transcripts_kb_status_check
  CHECK (kb_status IN ('PROCESSING', 'SUCCESS', 'FAILED'));
ALTER TABLE call_transcripts ADD COLUMN IF NOT EXISTS kb_error TEXT;

-- L1.5: topic segments over a transcript's named turns. seq is the
-- authoritative order (matches source_index discipline elsewhere — never
-- resorted by timestamp). attribution_uncertain is set at ingest time when
-- any contributing speaker label's InferredSpeaker.confidence was
-- medium/low or never LLM-confirmed (see apps/ai chunking/attribution.ts).
CREATE TABLE IF NOT EXISTS topic_segments (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  transcription_id       UUID NOT NULL REFERENCES transcriptions (id) ON DELETE CASCADE,
  seq                    INTEGER NOT NULL,
  label                  TEXT NOT NULL,
  summary                TEXT NOT NULL,
  segment_ids            TEXT[] NOT NULL,
  token_count            INTEGER NOT NULL,
  boundary_signals       TEXT[] NOT NULL DEFAULT '{}',
  attribution_uncertain  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topic_segments_transcription_seq_key UNIQUE (transcription_id, seq)
);

CREATE INDEX IF NOT EXISTS topic_segments_call_id_idx ON topic_segments (call_id);

-- L2 turn-window chunks and L1.5 topic-summary chunks (tier distinguishes
-- them). segment_ids are the utterance ids spanned; anchor_segment_id is
-- the single best id to cite if this chunk is retrieved (§6.3.4 in the
-- source spec) — guarantees every chunk has a citable line even before
-- generation picks one. body is exactly what was embedded, so grounding
-- checks (apps/ai chat/validateCitations.ts) validate against body, never
-- against a fresh lookup of the original segment's full text — see the
-- plan's "Reliability requirements" for why that distinction matters for
-- the single over-long-turn split case.
CREATE TABLE IF NOT EXISTS chunks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id                UUID NOT NULL REFERENCES calls (id) ON DELETE CASCADE,
  transcription_id       UUID NOT NULL REFERENCES transcriptions (id) ON DELETE CASCADE,
  topic_segment_id       UUID REFERENCES topic_segments (id) ON DELETE SET NULL,
  tier                   TEXT NOT NULL,
  seq                    INTEGER NOT NULL,
  body                   TEXT NOT NULL,
  body_hash              TEXT NOT NULL,
  segment_ids            TEXT[] NOT NULL,
  anchor_segment_id      TEXT,
  token_count            INTEGER NOT NULL,
  attribution_uncertain  BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  body_tsv               TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', body)) STORED,
  CONSTRAINT chunks_tier_check CHECK (tier IN ('turn_window', 'topic_summary')),
  CONSTRAINT chunks_transcription_tier_seq_key UNIQUE (transcription_id, tier, seq)
);

CREATE INDEX IF NOT EXISTS chunks_call_id_idx ON chunks (call_id);
CREATE INDEX IF NOT EXISTS chunks_transcription_id_tier_idx ON chunks (transcription_id, tier);
CREATE INDEX IF NOT EXISTS chunks_body_tsv_idx ON chunks USING gin (body_tsv);

-- Embedding dimension is fixed per deployment (pgvector requires a static
-- column width) — changing LLM_EMBEDDING_DIMENSIONS after chunks already
-- exist requires a re-embedding migration, same "one irreversible
-- decision" caveat the source spec calls out for its own frozen constant.
-- No ANN index (HNSW/IVFFlat) yet: retrieval is scoped to one call or deal
-- at a time, and exact-scan cosine distance over dozens-to-low-hundreds of
-- rows needs no index to be fast.
CREATE TABLE IF NOT EXISTS chunk_embeddings (
  chunk_id      UUID PRIMARY KEY REFERENCES chunks (id) ON DELETE CASCADE,
  model         TEXT NOT NULL,
  embedding     VECTOR(1024) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chat conversations, scoped to a single call or a single deal (see the
-- plan: selection/global scope is a later phase). ACL is resolved through
-- the same CallService.assertCallAccess/assertDealAccess gates used
-- everywhere else — no separate per-transcript ACL table.
CREATE TABLE IF NOT EXISTS conversations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope_type         TEXT NOT NULL,
  scope_call_id      UUID REFERENCES calls (id) ON DELETE CASCADE,
  scope_deal_id      UUID REFERENCES deals (id) ON DELETE CASCADE,
  title              TEXT,
  carried_evidence   JSONB NOT NULL DEFAULT '[]'::jsonb,
  turn_count         INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_scope_type_check CHECK (scope_type IN ('call', 'deal')),
  CONSTRAINT conversations_scope_coherent CHECK (
    (scope_type = 'call' AND scope_call_id IS NOT NULL AND scope_deal_id IS NULL) OR
    (scope_type = 'deal' AND scope_deal_id IS NOT NULL AND scope_call_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);

-- context_stats records the per-turn token-budget outcome (which slots
-- were dropped, by how much) — see the plan's context-budget table.
-- citations carries {segmentId, chunkId, quote} per citation, validated
-- against the exact text shown to the model, not a fresh segment lookup.
CREATE TABLE IF NOT EXISTS messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role               TEXT NOT NULL,
  content            TEXT NOT NULL,
  original_query     TEXT,
  rewritten_query    TEXT,
  citations          JSONB NOT NULL DEFAULT '[]'::jsonb,
  context_stats      JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_role_check CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages (conversation_id, created_at);
