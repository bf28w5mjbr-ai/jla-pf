# Cursor Cloud 開発環境メモ

最終更新: 2026-10-16  
**位置づけ:** Cloud VM 固有の手順のみ。承認ゲート・役割・Git 方針の正本はリポジトリ直下の `AGENTS.md` と `.cursor/rules/`。

> PR #42（`cursor/dev-env-agents-md-96de`）は Cloud 手順を `AGENTS.md` 単体で追加していた。  
> 体制文書取り込み後は **本ファイルへ分離**し、PR #42 は supersede（クローズまたは Cloud 節削除へ更新）する。

## Product overview

Bluvium is a single Next.js 16 monolith (web + API). Capacitor mobile shells load the remote web app and are optional for web-only development.

## Required services

| Service | Command | Port |
|---------|---------|------|
| Next.js dev server | `pnpm dev` | 3000 |
| PostgreSQL | via `DATABASE_URL` (Supabase pooler is fine) | 6543 (pooler) / 5432 (direct) |

## Environment variables

Runtime requires at minimum:

- `DATABASE_URL` — in Cloud VM, prefer the **Supabase transaction pooler** (`*.pooler.supabase.com:6543`) when that is what the task injected.
- `AUTH_SECRET` — at least 32 characters.
- `RESEND_API_KEY` — required for `/api/health` to return 200 when registration email OTP is enabled.

Optional integrations (Stripe, Supabase Storage, Firebase, AWS SNS/S3) are not needed for basic browsing, auth UI, or health smoke tests.

### Direct URL / migrate caveat

`DATABASE_URL_UNPOOLED` (Supabase direct `db.*.supabase.co:5432`) may be **unreachable** from Cloud (e.g. IPv6 `ENETUNREACH`). Do not assume `pnpm prisma migrate` works there.

**Approval gates still apply:** connecting to shared/dev/prod databases, running migrate, or printing connection strings requires task-level approval (`AGENTS.md`). Cloud convenience does not override gates.

There is no `.env.example` in the repository. Cloud agents should use injected secrets. For local shells, `vitest.config.ts` loads `.env` / `.env.local` if present. Never echo secret values into chat or logs.

## Standard commands

See `package.json` and `README.md`. Quick reference:

| Task | Command |
|------|---------|
| Install deps | `pnpm install --frozen-lockfile` |
| Dev server | `pnpm dev` |
| Lint | `pnpm lint` |
| Unit tests | `pnpm test --run` |
| Build | `pnpm build` (set `AUTH_SECRET` if not in env) |
| E2E smoke | `E2E_BASE_URL=http://localhost:3000 pnpm vitest run tests/e2e/health.e2e.test.ts` |

`postinstall` runs `prisma generate` automatically.

## Dev server caveats

- `pnpm dev` also runs `prisma generate` before `next dev`.
- If `.next/dev/lock` errors appear, another Next.js process is already running on port 3000.
- Health: `GET /api/health/live` (process only), `GET /api/health` (DB + config readiness).

## Lint status

`pnpm lint` may report pre-existing errors on the base branch. CI runs the same command; unit tests and build are the more reliable green checks for environment validation.
