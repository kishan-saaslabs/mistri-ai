## Learned User Preferences
- Match the existing frontend theme (Dialog, Button, tokens, spacing) instead of introducing new visual styles.
- Reuse existing Swagger/API endpoints when building UI rather than adding new ones unless asked.
- Keep the call-details Share link hidden until asked to ship it.
- Refresh pending call status by polling call details (`GET /calls/:id`), not by refetching call lists.
- Call Markdown/JSON export should offer Transcript, Intel, or both, and JSON keys should match the UI section titles.
- Show queued/processing call state with the theme warning yellow.

## Learned Workspace Facts
- Local Docker is OrbStack; Postgres runs via docker compose (`pnpm db:up` / `pnpm db:down`) as `postgres:16-alpine` on localhost:5432 with db/user `mistri`.
- Postgres applies `POSTGRES_PASSWORD` only on first volume init; after changing `.env`, recreate with `docker compose down -v` then `pnpm db:up`.
- The API reads repo-root `.env`; `pnpm db:migrate` and `pnpm db:seed` use that `DATABASE_URL`.
- Call details (`CallDetailView`) loads transcript from the call API; the Intel column is still hardcoded demo data.
- Uploaded recordings stream from authenticated `GET /api/calls/:id/audio`; calls with only `source_url` play that URL on the client.
