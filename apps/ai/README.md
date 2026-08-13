# @mistri-ai/ai

LLM-powered speaker name inference for Mistri AI. A plain library — no
server, no `app.listen()` — imported by `apps/api` and mounted as a route
on its existing authenticated router.

## What it does

Given a diarized transcript (`speaker_1`, `speaker_2`, ...), it infers each
speaker's likely real name from evidence in the transcript itself (a
self-introduction, being addressed by name, "this is X from Y company"),
falling back to a role guess ("Agent", "Customer") when there's no
evidence — it never invents a name it can't point to in the text.

Processing runs asynchronously via a BullMQ job (queue `infer-and-rename`),
not on the request that triggers it:

- `POST /api/calls/:id/infer-and-rename` validates the call/transcription
  and enqueues a job, returning `202 { status: "queued", transcriptionId }`
  immediately. It does not call the LLM itself.
- A `Worker` running inside `apps/api`'s own process
  (`apps/api/src/queue/inferAndRenameWorker.ts`, started in `index.ts`
  alongside the Express server) consumes the job and runs the actual
  inference — the exact same logic (`TranscriptionService.inferAndRenameSpeakers`)
  that used to run synchronously in the request.
- Results (suggestions with confidence/evidence — `InferredSpeaker[]` —
  plus the fully resolved named transcript) are upserted into a dedicated
  `call_transcripts` table (`apps/api/src/db/schema.sql`), keyed uniquely
  by `transcription_id`.

The recommended flow is still **suggest → human confirms/edits → apply the
confirmed map** (via `applySpeakerNames`), so a wrong LLM guess never
silently ships — but note there is currently **no GET endpoint** to poll
`call_transcripts` over HTTP; a caller would need to read that table
directly until one is added.

Caching is per `transcription_id`: once a job completes for a given
transcription, `inferAndRenameSpeakers` finds the cached row and skips the
LLM call entirely on any later run for that same transcription_id. A
re-transcription (a new transcription row) always triggers a fresh
inference, since its segments may differ.

Something other than this HTTP endpoint can also publish a job directly —
`publishInferAndRenameJob({ callId, transcriptionId })` from
`apps/api/src/queue/inferAndRenameQueue.ts` is the one place that knows how
to enqueue; it doesn't know or care when it's called (e.g. automatically
right after a transcription becomes `ready`, instead of only on-demand via
this route).

## Setup — get a free NVIDIA API key

1. Go to [build.nvidia.com](https://build.nvidia.com) → API Catalog.
2. Generate a free API key (BYOK, free tier).
3. In the root `.env` (copied from `.env.example`), set:

```bash
LLM_PROVIDER=nvidia
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=<your key>
LLM_MODEL=meta/llama-3.1-8b-instruct
```

`LLM_API_KEY` is only required when a job actually reaches the worker —
`apps/api` runs fine without it otherwise (the job will simply fail and
retry per BullMQ's backoff until it's set).

The worker also needs Redis running (`REDIS_URL` in `.env`, defaults to
`redis://localhost:6379`):

```bash
pnpm redis:up
```

## Switching providers

Any OpenAI-compatible chat completions endpoint works — OpenAI, Groq,
Together.ai, etc. Change `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`;
no code changes required. Provider identity is config only — see
`src/llm/getLLMClient.ts` for where a genuinely non-OpenAI-compatible
provider (e.g. native Anthropic Messages API) would be added later.

## Dev-loop note

`apps/api`'s dev script (`tsx watch`) resolves `@mistri-ai/ai` through its
compiled `dist/`, not its source. Editing `apps/ai/src/*.ts` won't be
picked up until you rebuild:

```bash
pnpm --filter @mistri-ai/ai build
```

Otherwise it looks exactly like a stale-cache bug mid-debug.

## response_format reliability (informational)

Small OpenAI-compatible models — including `meta/llama-3.1-8b-instruct` on
NIM — don't always honor `response_format: { type: "json_object" }`
consistently. This is already handled: a deterministic regex pass resolves
obvious self-introductions before the LLM is ever called, and any response
that fails parsing/validation gets one retry, then a safe positional
fallback (`Speaker A`, `Speaker B`, ...) rather than surfacing bad output.

## Tests

```bash
pnpm --filter @mistri-ai/ai test
```

Uses a mock `LLMClient` (`src/llm/mockClient.ts`) — no real network call or
vendor dependency, which is the actual test of "provider-agnostic".
