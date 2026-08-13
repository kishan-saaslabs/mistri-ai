# Mistri AI

Open-source conversation intelligence for sales teams — an MIT-licensed alternative to Gong.

Mistri AI records the shape of a deal from the call itself: transcript, deal health, buying signals, risks, and next steps. This repository is a pnpm workspace with two apps:

| App | Stack | Path |
| --- | --- | --- |
| API | Express, Node.js, Postgres, JWT, Multer | `apps/api` |
| Frontend | Vite, React Router, Tailwind CSS, shadcn/ui | `apps/frontend` |

## Quick start

**Requirements:** Node.js 20+, [pnpm](https://pnpm.io/) 10+, Docker (for Postgres).

```bash
git clone https://github.com/kishan-saaslabs/mistri-ai.git
cd mistri-ai
pnpm install
cp .env.example .env
```

Set `POSTGRES_PASSWORD`, `JWT_SECRET` (32+ characters), and `PYAI_API_KEY` in `.env`.

```bash
# example — run locally, do not commit the output
openssl rand -base64 48
```

Then:

```bash
pnpm db:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Frontend: http://localhost:5173
- API health: http://localhost:3001/health
- Swagger UI: http://localhost:3001/docs
- OpenAPI JSON: http://localhost:3001/openapi.json

The UI ships with demo call data so you can explore Calls, Deals, and Ask Mistri without wiring a live transcription pipeline. Uploads and auth persist through the API once Postgres is running.

## Workspace scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run API and frontend together |
| `pnpm dev:api` / `pnpm dev:frontend` | Run one app |
| `pnpm build` | Typecheck and build both apps |
| `pnpm typecheck` | Typecheck both apps |
| `pnpm db:up` | Start Postgres via Docker Compose |
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
| `POST` | `/api/calls/upload` | multipart `file` + optional `dealId`; transcribes via PyAI |
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
apps/frontend/src
  pages/         Calls, Deals, Ask
  components/    layout + shadcn/ui
  state/         demo workspace store
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security policy](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Kishan Kumar
