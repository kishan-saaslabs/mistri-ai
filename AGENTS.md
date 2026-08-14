## Learned User Preferences
- Match the existing frontend theme (Dialog, Button, tokens, spacing) instead of introducing new visual styles.
- Reuse existing Swagger/API endpoints when building UI rather than adding new ones unless asked.
- Keep the call-details Share link hidden until asked to ship it.
- Refresh pending call status by polling call details (`GET /calls/:id`), not by refetching call lists.
- Call Markdown/JSON export should be a dropdown (Transcript, Intel, or both) that downloads immediately on pick; JSON keys should match the UI section titles.
- Show in-flight call statuses (`PROCESSING`, `PYAI_TRANSCRIBING`, `LLM_TRANSCRIBING`) with the theme warning yellow.
- Keep the call-details audio player synced with the transcript; jumping to a segment should play only that clip, then pause.
- Clickable controls (buttons, links, tabs, menus) should use a pointer cursor.
- Keep the existing dark-mode palette; do not overhaul contrast unless asked.
- Loading skeletons must match the final layout (size and shape) so content does not shift when data arrives.
- Dialogs keep the default backdrop blur; do not add enter animations or blur modal text.

## Learned Workspace Facts
- Local Docker is OrbStack; Postgres runs via docker compose (`pnpm db:up` / `pnpm db:down`) as `postgres:16-alpine` on localhost:5432 with db/user `mistri`.
- Postgres applies `POSTGRES_PASSWORD` only on first volume init; after changing `.env`, recreate with `docker compose down -v` then `pnpm db:up`.
- The API reads repo-root `.env`; `pnpm db:migrate` and `pnpm db:seed` use that `DATABASE_URL`.
- Call details (`CallDetailView`) loads transcript and Intel from the call API; the title shows speaker count, not speaker tags.
- Uploaded recordings stream from authenticated `GET /api/calls/:id/audio`; calls with only `source_url` play that URL on the client.
- Call and transcription statuses are `PROCESSING`, `PYAI_TRANSCRIBING`, `PYAI_SUCCESS`, `PYAI_FAILED`, `LLM_TRANSCRIBING`, `LLM_SUCCESS`, `LLM_FAILED` (`queued` is gone; default is `PROCESSING`).
- Frontend data fetching uses React Query (`@tanstack/react-query`).
- Deal and call details share a deals-list sidebar; the open deal stays highlighted.
