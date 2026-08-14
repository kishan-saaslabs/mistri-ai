# Mistri AI

Open-source conversation intelligence for sales teams — an MIT-licensed alternative to Gong.

![Deals view](<img width="3024" height="1964" alt="Screenshot 2026-08-14 at 4 18 44 PM (1)" src="https://github.com/user-attachments/assets/c6369c67-ab68-46af-b20d-435b2aac9040" />)  

Mistri AI records the shape of a deal from the call itself: transcript, deal health, buying signals, risks, and next steps. This repository is a pnpm workspace with two apps:

| App | Stack | Path |
| --- | --- | --- |
| API | Express, Node.js, Postgres, JWT, MinIO | `apps/api` |
| Frontend | Vite, React Router, Tailwind CSS, shadcn/ui | `apps/frontend` |

## Quick start

**Requirements:** Node.js 20+, [pnpm](https://pnpm.io/) 10+, Docker (for Postgres, Redis, and MinIO).

```bash
git clone https://github.com/kishan-saaslabs/mistri-ai.git
cd mistri-ai
pnpm bootstrap
pnpm dev
```

`pnpm bootstrap` runs `pnpm install`, copies `.env` if needed, fills empty local secrets (`JWT_SECRET`, Postgres, MinIO, seed password), starts Postgres (pgvector), Redis, and MinIO, waits until they are healthy, migrates, and seeds. (`pnpm setup` is a pnpm CLI command and will not run this.)

Add `PYAI_API_KEY` and `LLM_API_KEY` in `.env` when you want live transcription and deal notes. For large recordings, set `S3_PUBLIC_ENDPOINT` to a public **https** origin that reaches MinIO (or use S3/R2) so PyAI can fetch the file. Do not commit `.env`.

- Frontend: http://localhost:5173
- API health: http://localhost:3001/health
- Swagger UI: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json
- Demo login: `demo@mistri.ai` (password is `SEED_USER_PASSWORD` in `.env`)

The UI ships with demo call data so you can explore Calls, Deals, and Ask Mistri without wiring a live transcription pipeline. Uploads and auth persist through the API once Postgres is running.

## Workspace scripts

| Command | What it does |
| --- | --- |
| `pnpm bootstrap` | Install deps, create `.env` if missing, start Postgres + Redis + MinIO, migrate, seed |
| `pnpm dev` | Run API and frontend locally |
| `pnpm dev:api` / `pnpm dev:frontend` | Run one app |
| `pnpm build` | Typecheck and build both apps |
| `pnpm typecheck` | Typecheck both apps |
| `pnpm docker:up` | Start Postgres, Redis, and MinIO and wait until healthy |
| `pnpm db:up` | Start Postgres via Docker Compose |
| `pnpm redis:up` | Start Redis via Docker Compose (BullMQ job queue) |
| `pnpm db:migrate` | Apply SQL schema |
| `pnpm db:seed` | Insert demo users and deals (`SEED_USER_PASSWORD` required) |

## API shape

Authenticated routes expect `Authorization: Bearer <token>`.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/register` | email, password (min 10), name |
| `POST` | `/api/auth/login` | |
| `GET` | `/api/auth/me` | |
| `GET`/`POST` | `/api/deals` | |
| `GET` | `/api/deals/:id/calls` | calls for one deal |
| `GET` | `/api/calls` | |
| `GET`/`PATCH` | `/api/calls/:id` | GET includes `transcriptions`; PATCH maps `dealId` |
| `GET` | `/api/calls/:id/transcriptions` | JSON array of segment objects |
| `POST` | `/api/calls/:id/transcribe` | re-run PyAI Hear on the stored file |
| `POST` | `/api/calls/:id/infer-and-rename` | `202`, queues a BullMQ job (`apps/ai` inference); no polling endpoint yet |
| `POST` | `/api/calls/uploads/presign` | JSON `{ filename, contentType?, size, dealId? }` → presigned PUT |
| `POST` | `/api/calls/uploads/complete` | JSON `{ objectKey, filename, dealId? }`; transcribes via PyAI |
| `POST` | `/api/calls/upload` | multipart `file` + optional `dealId` (API copies into object storage) |
| `POST` | `/api/calls/link` | JSON `{ url, dealId? }` |

Passwords are hashed with bcryptjs. JWT secrets and database credentials come from the environment only.

## Project layout

```
apps/api/src
  config/        env + Postgres pool
  db/            schema, migrate, seed
  models/        data access
  controllers/   HTTP handlers
  routes/        Express routers
  middleware/    auth, upload, errors
  services/      business rules
  queue/         BullMQ job queue + worker (speaker inference)
apps/frontend/src
  pages/         Calls, Deals, Ask
  components/    layout + shadcn/ui
  state/         demo workspace store
apps/ai/src
  llm/           provider-agnostic LLM client (see apps/ai/README.md)
  speakerInference.ts, speakerNameMapper.ts
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Kishan Kumar
