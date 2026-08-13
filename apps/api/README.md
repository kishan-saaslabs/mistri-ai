# @mistri-ai/api

Express API (MVC) for Mistri AI.

- Postgres via `DATABASE_URL`
- JWT auth (`JWT_SECRET` from the environment)
- Multer uploads under `UPLOAD_DIR` (gitignored)

From the repo root:

```bash
pnpm db:up
pnpm db:migrate
pnpm --filter @mistri-ai/api dev
```
