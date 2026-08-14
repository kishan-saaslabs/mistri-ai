# @mistri-ai/ai

LLM-powered speaker name inference and call insights for Mistri AI. A
plain library — no server, no `app.listen()` — imported by `apps/api` and
run via BullMQ workers there.

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

## Call insights

`generateCallInsights` (`src/callInsights.ts`) answers four questions from
a call's **named** transcript (real speaker names, not `speaker_1`/`speaker_2`
— so this only runs after speaker-name inference has already produced a
`call_transcripts` row): what happened on the call, what objections came
up, what the customer wants, and what to do next — plus an optional
follow-up-email draft when the call ended with something concrete still
open (a commitment, a specific price/date/quantity, something the rep
said they'd send).

Every item is grounded: each claim cites a real segment id AND the quote
itself is checked (case/whitespace-normalized) against that segment's
actual text, so the model can't fabricate or splice together a quote and
have it slip through attributed to a real id. Partial (unfinalized)
segments are excluded entirely from what the model even sees — same
reasoning as excluding them from speaker-name inference. Unlike speaker
naming there's no safe synthetic fallback for a call summary, so a
response that still fails validation after one retry throws rather than
shipping bad output.

Triggered the same way as the naming pipeline: `TranscriptionService`
publishes a `call-insights` job (`publishCallInsightsJob`) right after a
*fresh* speaker-naming run succeeds — not on a cache hit, since only a
fresh run produces a new `call_transcripts` row for it to read. A
dedicated `CallInsightsWorker` (`apps/api/src/queue/callInsightsWorker.ts`)
consumes it and upserts the result into `call_insights`, keyed uniquely by
`transcription_id`.

## Call insights is a fully independent LLM connection, on purpose

Speaker naming and call insights don't just run on different models — call
insights can run on an **entirely different provider**, not merely a
different model on the same account. Every connection property has an
independent `*_INSIGHTS` override that falls back to its speaker-naming
counterpart if unset: `LLM_PROVIDER` / `LLM_PROVIDER_INSIGHTS`,
`LLM_BASE_URL` / `LLM_BASE_URL_INSIGHTS`, `LLM_API_KEY` /
`LLM_API_KEY_INSIGHTS`, `LLM_MODEL` / `LLM_MODEL_INSIGHTS`. **Don't
"simplify" this back down to one shared connection.** They have different
risk profiles:

- **Speaker naming** is cheap (usually resolved by the regex pass with no
  LLM call at all) and has a safe fallback if the model gets it wrong — a
  positional label (`Speaker A`) rather than a confidently wrong name. A
  small, fast model is the right tradeoff.
- **Call insights** has no such fallback — a validation failure after one
  retry throws away the whole result, not just one field — and it asks
  for more structured output in a single response (five sub-schemas,
  verbatim quote reproduction, a judgment call on the follow-up email).
  That's a harder one-shot generation task, worth a larger/more capable
  model even at higher per-call cost, since fewer retries and failures
  tends to make it cheaper net, not more expensive. That larger model may
  live on an entirely different provider with its own endpoint, account,
  and rate limits — not just a different model name on the same NIM
  account — which is why every property is independently overridable, not
  just the model.

Leave all four `*_INSIGHTS` vars unset and call insights transparently
reuses the speaker-naming connection as-is — nothing breaks, nothing
needs to change, for a setup that only ever defines the base four.

`getLLMClient({ baseUrl?, model?, apiKey? })` (`src/llm/getLLMClient.ts`)
takes an optional overrides object; `getInsightsLLMClient()` is a thin
wrapper that resolves all of them to their `*_INSIGHTS` values. Provider,
endpoint, model, AND key selection all stay confined to that one file —
call sites never hardcode a model string or reach into config directly,
so swapping any of them, or the provider entirely, stays config-only.

## Setup — get a free NVIDIA API key

1. Go to [build.nvidia.com](https://build.nvidia.com) → API Catalog.
2. Generate a free API key (BYOK, free tier).
3. In the root `.env` (copied from `.env.example`), set:

```bash
LLM_PROVIDER=nvidia
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=<your key>
LLM_MODEL=meta/llama-3.1-8b-instruct        # speaker naming

# call insights — all optional, each falls back to its speaker-naming
# counterpart above if unset. Only set what actually differs.
LLM_MODEL_INSIGHTS=nvidia/llama-3.3-nemotron-super-49b-v1.5
# LLM_PROVIDER_INSIGHTS=some-other-provider
# LLM_BASE_URL_INSIGHTS=https://api.some-other-provider.com/v1
# LLM_API_KEY_INSIGHTS=<a different key>
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
Together.ai, etc. Change `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` /
`LLM_MODEL_INSIGHTS`; no code changes required. Provider identity is
config only — see `src/llm/getLLMClient.ts` for where a genuinely
non-OpenAI-compatible provider (e.g. native Anthropic Messages API) would
be added later.

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

Reasoning models (like `minimaxai/minimax-m3`, used for call insights) can
surface reasoning tokens either in a separate response field
(`reasoning_content` or similar — `openAiCompatibleClient.ts` only ever
reads `choices[0].message.content`, so a separate field is already ignored
with no code change needed) or, less commonly, inlined into `content`
itself. The latter would fail `JSON.parse` and fall into the same
retry-then-throw path as any other malformed response — not a silent
correctness issue, just a cost/latency one worth watching for a new model.

`LLM_THINKING_MODE_INSIGHTS` (optional, `true`/`false`) lets you explicitly
toggle reasoning for the insights model instead of relying on its default.
Sent as `chat_template_kwargs.enable_thinking` (the vLLM/Qwen3-style
convention NIM-hosted open reasoning models tend to follow) only when set
— **this exact field name is unverified against minimax-m3's actual docs**,
confirmed only to the extent that NIM accepted it without a validation
error in one live request. Leave unset to use the model's own default.

## Tests

```bash
pnpm --filter @mistri-ai/ai test
```

Uses a mock `LLMClient` (`src/llm/mockClient.ts`) — no real network call or
vendor dependency, which is the actual test of "provider-agnostic".
