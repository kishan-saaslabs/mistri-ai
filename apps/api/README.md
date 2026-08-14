# @mistri-ai/api

Express API (MVC) for Mistri AI.

- Postgres via `DATABASE_URL`
- JWT auth (`JWT_SECRET` from the environment)
- Recordings in S3-compatible object storage (`S3_*` from the environment)

From the repo root:

```bash
pnpm db:up
pnpm db:migrate
pnpm --filter @mistri-ai/api dev
```

Swagger UI: http://localhost:3001/docs  
OpenAPI JSON: http://localhost:3001/openapi.json
