# Contributing to Mistri AI

Thanks for helping build an open-source alternative to Gong. This document covers how to propose changes.

## Ground rules

- Be kind. Follow the [Code of Conduct](CODE_OF_CONDUCT.md).
- Keep pull requests focused. One concern per PR is easier to review.
- Do not commit secrets, recordings of real customer calls, or personal data.
- Prefer secure defaults: parameterized SQL, env-based credentials, validated uploads.

## Development setup

1. Install [Node.js](https://nodejs.org/) 20+ and [pnpm](https://pnpm.io/) 10+.
2. Clone the repo and install dependencies:

   ```bash
   pnpm install
   ```

3. Copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` and `JWT_SECRET` (at least 32 random characters).
4. Start Postgres and apply schema:

   ```bash
   pnpm db:up
   pnpm db:migrate
   pnpm db:seed
   ```

5. Run both apps:

   ```bash
   pnpm dev
   ```

   - API: http://localhost:3001
   - Frontend: http://localhost:5173

## Workspace layout

```
apps/api        Express + Postgres API (MVC)
apps/frontend   Vite + React Router UI
```

Use `pnpm --filter @mistri-ai/api <script>` or `pnpm --filter @mistri-ai/frontend <script>` to target one app.

## Pull requests

1. Create a branch from `main`.
2. Add tests or a short manual test plan for user-facing changes.
3. Run `pnpm typecheck` and `pnpm build` locally.
4. Open a PR using the template. Fill in **why**, not only **what**.

## Reporting security issues

Do not open a public issue for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
