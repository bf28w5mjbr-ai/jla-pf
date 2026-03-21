# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

JLA PF (Japan Lifesaving Association Platform) — a Next.js 16 full-stack app (App Router) managing members, clubs, qualifications, competitions, and Stripe-based payments. Single `package.json` at root, pnpm as package manager.

### Services

| Service | How to run | Port | Notes |
|---|---|---|---|
| Next.js dev server | `pnpm dev` | 3000 | The single application process (frontend + API routes) |
| PostgreSQL | `sudo pg_ctlcluster 16 main start` | 5432 | Must be running before `pnpm dev` |

### Key commands

See `package.json` scripts. Summary:

- **Dev**: `pnpm dev`
- **Lint**: `pnpm lint` (pre-existing lint errors in the codebase)
- **Build**: `pnpm build`
- **Prisma generate**: `npx prisma generate`
- **Prisma push schema**: `npx prisma db push`

### Environment variables

A `.env.local` file is needed with `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_ORIGIN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_PLATFORM_FEE_BPS`. A `.env` file with just the database URLs is also needed for Prisma CLI commands.

### Gotchas

- The `pnpm.onlyBuiltDependencies` field in `package.json` is required so that `pnpm install` runs native build scripts for `@prisma/client`, `prisma`, `bcrypt`, `sharp`, and `unrs-resolver`. Without it, pnpm silently skips their postinstall scripts.
- The `_health` API route (`src/app/api/_health/route.ts`) is not accessible via HTTP because the `_` prefix makes it a private segment in Next.js App Router.
- The dashboard page imports `LogoutButton` at the file bottom outside the component — this is a pre-existing code style in the codebase.
- ESLint runs but reports 5 pre-existing errors (mostly `@typescript-eslint/no-explicit-any`) — these are not caused by dev environment setup.
- PostgreSQL must be started manually (`sudo pg_ctlcluster 16 main start`) before running the dev server or Prisma commands.
- After `pnpm install`, run `npx prisma generate` if the Prisma client is stale, and `npx prisma db push` to sync schema.
