# Safi360

Multi-tenant B2B SaaS for cleaning and facility-management companies in Tanzania.
One React app serves four experiences; Supabase (Postgres + RLS + Edge Functions) is the backend.

| Experience        | Route        | Audience                        | Default language |
| ----------------- | ------------ | ------------------------------- | ---------------- |
| Customer portal   | `/:slug/*`   | anonymous customers (OTP-gated) | Swahili          |
| Operations portal | `/ops/*`     | owner / manager / dispatcher    | user preference  |
| Field app (PWA)   | `/field/*`   | cleaners                        | Swahili          |
| Control center    | `/control/*` | Safi360 team                    | English          |

Sources of truth: the product blueprint (`Safi360 — Cleaning Business SaaS Blueprint (Tanzania).pdf`),
the UI references in `UI/`, and the build brief. Security and data rules in the brief win over the
blueprint; the blueprint wins on behaviour; the UI references win on appearance.

## Requirements

- Node ≥ 20.19 (developed on 24) and pnpm 9 (`corepack enable pnpm`)
- Docker only if you want the full local Supabase stack (`supabase start`). **Not needed** for
  `pnpm test:db`: database tests run on an embedded Postgres (PGlite).

## Run

```bash
pnpm install
cp .env.example .env.local      # fill VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
pnpm dev                        # http://localhost:5173/ops
```

With Docker + the Supabase CLI:

```bash
supabase start                  # applies supabase/migrations + seed.sql
supabase status                 # copy the anon key into .env.local
```

Seeded logins (local only, OTP `123456`): owner of _Usafi Bora Cleaners_ `+255 754 000 001`,
owner of _Pwani Fresh Cleaning_ `+255 754 000 002`, super admin `+255 754 000 003`.

## Test

| Command          | What it covers                                                               |
| ---------------- | ---------------------------------------------------------------------------- |
| `pnpm typecheck` | TypeScript strict, both app and tooling projects                             |
| `pnpm lint`      | ESLint (type-aware) incl. the "no hex colours in components" rule            |
| `pnpm test`      | Vitest + Testing Library: lib helpers, shared components, i18n key parity    |
| `pnpm test:db`   | Migrations, enum parity, RLS isolation, ticket allocator, auth hook (PGlite) |
| `pnpm test:e2e`  | Playwright smoke across the four shells (desktop + mobile)                   |
| `pnpm check`     | typecheck + lint + test + test:db                                            |

CI (`.github/workflows/ci.yml`) runs all of the above plus `pnpm build`.

## Layout

```
src/
  app/            router, providers, layouts per experience, route error/loading
  experiences/    portal · ops · field · control (pages + feature hooks)
  components/ui   primitives themed with Safi360 tokens (shadcn-style)
  components/shared  StatusBadge, PaymentStatus, NotificationStatus, SourceChip, TicketChip,
                     EmptyState, ErrorState, PageHeader, PhoneInput, AmountInput, SandboxBadge
  lib/            supabase client, env, phone (E.164), money (integer TZS), dates (Dar es Salaam),
                  permissions, idempotency, brand colour
  i18n/           sw.json · en.json (every user-facing string; parity-tested)
  styles/         globals.css — the only file allowed to contain colour literals
supabase/
  migrations/     one file per change, never edited after it is applied
  functions/_shared/  enums + zod schemas shared with the client (@shared alias), http/tenant/rate-limit/log helpers
  tests/          PGlite harness + SQL-level tests
  seed.sql        sample tenants and users
```

## Conventions

- Money is integer TZS (`*_tzs`), phones are E.164 (`+255…`), timestamps are UTC and rendered in
  `Africa/Dar_es_Salaam`.
- Tenant isolation is enforced by RLS using JWT claims `tenant_id`, `tenant_role`, `is_super_admin`
  (added by `public.custom_access_token_hook`). Never pass `tenant_id` from the client.
- Customers never touch tables directly; public actions go through Edge Functions with the service
  role, zod validation (`supabase/functions/_shared/schemas.ts`) and rate limiting.
- No hex colours in components — use Tailwind tokens (`bg-primary`, `text-success-text`, …).
- Every string goes through i18next; `sw.json` and `en.json` must have identical keys.
