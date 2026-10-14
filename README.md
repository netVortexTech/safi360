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
owner of _Pwani Fresh Cleaning_ `+255 754 000 002`, super admin `+255 754 000 003`. Sign in at
`/ops/login`; the ops portal requires an OWNER, MANAGER or DISPATCHER membership.

Usafi Bora is seeded with a full catalog (sofa, carpets, mattresses, deep clean, post-construction,
office, fumigation, water tanks, mould treatment, commercial), add-ons, four service areas and four
cleaners with weekly hours and leave. The same price list is the fixture the pricing tests run on.

## Test

| Command             | What it covers                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| `pnpm typecheck`    | TypeScript strict, both app and tooling projects                             |
| `pnpm lint`         | ESLint (type-aware) incl. the "no hex colours in components" rule            |
| `pnpm test`         | Vitest + Testing Library: lib helpers, shared components, i18n key parity    |
| `pnpm test:db`      | Migrations, enum parity, RLS isolation, ticket allocator, auth hook (PGlite) |
| `pnpm test:pricing` | Pricing + availability engines with a 100% coverage gate                     |
| `pnpm test:e2e`     | Playwright smoke across the four shells (desktop + mobile)                   |
| `pnpm check`        | typecheck + lint + test + test:db                                            |

CI (`.github/workflows/ci.yml`) runs all of the above plus `pnpm build`. Run `pnpm test:e2e` on its
own rather than alongside `pnpm check`; the two together exhaust memory on small machines.

## Connect a hosted Supabase project

No Docker needed; the pinned CLI runs through `pnpm supabase`.

```bash
pnpm supabase login                              # opens the browser once (real terminal only)
pnpm supabase link --project-ref <ref>           # asks for the database password
pnpm supabase db push --include-seed             # migrations, then seed.sql
pnpm supabase config push                        # auth hook, phone test OTPs, redirect URLs
pnpm supabase functions deploy quote availability --use-api
pnpm supabase projects api-keys --project-ref <ref>   # copy the anon key into .env.local
```

Push migrations before config: the config enables the access-token hook that migration 5 creates.
In a non-TTY shell (CI, an agent runner) `login` cannot open a browser; set `SUPABASE_ACCESS_TOKEN`
to a personal access token instead and add `--yes` to `db push` and `config push` so the prompts
do not auto-decline. The functions share `supabase/functions/deno.json` as their import map; the
`[functions.*]` sections in `config.toml` point at it, which hosted bundling needs.

The seeded owner `+255 754 000 001` then signs in with code `123456` (test OTP, no SMS provider
needed). Never run `db push --include-seed` against a project with real customers.

## Edge Functions

`supabase/functions/quote` and `supabase/functions/availability` are public (anonymous) endpoints
resolved by tenant slug, zod-validated and rate limited per IP. All logic lives in
`supabase/functions/_shared/handlers` with injected dependencies, so it is unit-tested under Vitest
without Deno. The catalog is read fresh on every call: a price saved in the ops portal is what the next
quote returns.

## Layout

```
src/
  app/            router, providers, layouts per experience, route error/loading
  experiences/    portal · ops (catalog, team, login) · field · control
  components/ui   primitives themed with Safi360 tokens (shadcn-style), dialog, switch, toast
  components/shared  StatusBadge, PaymentStatus, NotificationStatus, SourceChip, TicketChip,
                     EmptyState, ErrorState, PageHeader, PhoneInput, AmountInput, CodeInput,
                     DataView (table↔cards), PriceSummary, ConfirmDialog, UnsavedChangesGuard, SandboxBadge
  lib/            supabase client, auth (session + claims), env, phone (E.164), money (integer TZS),
                  dates (Dar es Salaam), permissions, idempotency, brand colour, error mapping
  i18n/           sw.json · en.json (every user-facing string; parity-tested)
  styles/         globals.css — the only file allowed to contain colour literals
supabase/
  migrations/     one file per change, never edited after it is applied
  functions/quote, functions/availability  public Edge Functions (Deno entrypoints only)
  functions/_shared/
    enums.ts, schemas.ts   shared with the client through the @shared alias
    pricing/               pure quote engine (8 pricing types, zones, add-ons, deposit, tax) + fixtures
    availability/          pure slot generator (hours × skills × availability × assignments × buffer)
    handlers/              request handlers with injected deps (+ in-memory fakes for tests)
  tests/          PGlite harness + SQL-level tests (isolation, constraints, seed ↔ fixture parity)
  seed.sql        two tenants, users, and the Usafi Bora catalog, zones, staff and availability
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
