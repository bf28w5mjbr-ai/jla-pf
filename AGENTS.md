# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Bluvium is a single Next.js 16 monolith (web + API). Capacitor mobile shells load the remote web app and are optional for web-only development.

### Required services

| Service | Command | Port |
|---------|---------|------|
| Next.js dev server | `pnpm dev` | 3000 |
| PostgreSQL | via `DATABASE_URL` (Supabase pooler is fine) | 6543 (pooler) / 5432 (direct) |

### Environment variables

Runtime requires at minimum:

- `DATABASE_URL` — use the **Supabase transaction pooler** (`*.pooler.supabase.com:6543`) in this cloud VM. It is reachable and works with Prisma at runtime.
- `AUTH_SECRET` — at least 32 characters.
- `RESEND_API_KEY` — required for `/api/health` to return 200 when registration email OTP is enabled.

Optional integrations (Stripe, Supabase Storage, Firebase, AWS SNS/S3) are not needed for basic browsing, auth UI, or health smoke tests.

**Note:** `DATABASE_URL_UNPOOLED` (Supabase direct `db.*.supabase.co:5432`) may be **unreachable** from this environment (IPv6 `ENETUNREACH`). Do not rely on `pnpm prisma migrate dev/deploy` via direct URL here. The shared dev database already has migrations applied; verify with:

```bash
node -e "const {Client}=require('pg'); const c=new Client({connectionString:process.env.DATABASE_URL}); c.connect().then(()=>c.query('SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3')).then(r=>{console.log(r.rows);c.end()})"
```

There is no `.env.example` in the repository. Cloud agents should use injected secrets (`DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, etc.). For local shells, `vitest.config.ts` loads `.env` / `.env.local` if present.

### Standard commands

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

### Dev server caveats

- `pnpm dev` also runs `prisma generate` before `next dev`.
- If `.next/dev/lock` errors appear, another Next.js process is already running on port 3000.
- Health: `GET /api/health/live` (process only), `GET /api/health` (DB + config readiness).

### Lint status

`pnpm lint` may report pre-existing errors on the base branch (custom `no-restricted-syntax` rules, React hooks lint). CI runs the same command; unit tests and build are the reliable green checks for environment validation.
