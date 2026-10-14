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

All public endpoints are resolved by tenant slug, zod-validated and rate limited (per IP, and per
phone for codes). All logic lives in `supabase/functions/_shared/handlers` with injected
dependencies, so it is unit-tested under Vitest without Deno; the Deno entrypoints are three lines
each on a shared runtime wrapper. The catalog is read fresh on every call.

| Function           | Purpose                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| `quote`            | Itemised price from the live catalog                                                 |
| `availability`     | Slots from working hours × staff × assignments × unassigned reserved bookings        |
| `otp_send`         | Hashed 6-digit code (5 min, 5 attempts) for booking or tracking                      |
| `otp_verify`       | Code → 15-minute HMAC token proving the phone                                        |
| `create_booking`   | Verified phone → fresh price → slot re-check → `create_booking_tx` (one transaction) |
| `tracking_start`   | Always answers `code_sent`; sends only when phone + ticket match                     |
| `tracking_verify`  | Token scoped to the phone + every booking on it (lost-ticket recovery)               |
| `tracking_view`    | Customer-safe projection + the actions policy allows                                 |
| `customer_action`  | Approve/decline quote, cancel inside policy, otherwise a request for the office      |
| `payment_start`    | Deposit intent through the provider interface (Mock adapter outside production)      |
| `payment_callback` | Provider webhook, verified by signature → `apply_payment_result`                     |

Function secrets (`supabase secrets set`): `OTP_TOKEN_SECRET`, `OTP_PROVIDER=mock` and
`PAYMENT_PROVIDER=mock` + `MOCK_PAYMENT_SECRET` outside production, `APP_ENV`. Without
`OTP_PROVIDER` the OTP functions answer `503 sms_not_configured` — nothing pretends to send.

### Booking engine rules (migration 0013)

- `create_booking_tx` is the only way a booking is created: per-tenant advisory lock, idempotency
  key + request hash, customer find-or-create by verified phone (same name on another phone is
  flagged, never merged), capacity re-check with the travel buffer, ticket from the locked counter,
  then routing: review → `AWAITING_REVIEW`, deposit due → `AWAITING_PAYMENT` (15-minute hold),
  else `CONFIRMED`.
- `transition_booking` is the only way a status changes (allowed-transition table with actors;
  `bookings.status` is not grantable to any client role, service role included).
- `apply_payment_result` is the only way a payment status changes.
- Holds: `hold_expires_at` on every waiting state; lapsed holds stop reserving capacity even before
  `expire_booking_holds` (pg_cron on hosted) marks them `EXPIRED`.

### Customer portal

`/:slug` boots from `public.portal_catalog(slug)` (anon RPC, explicit projection) and prices the
sticky total in the browser with the same engine the server runs at create time; the server
refuses a changed total (`409 quote_changed`). Routes: `/`, `/services`, `/services/:id`, `/book`
(5 steps), `/book/done/:ticket`, `/track`, `/track/recover`, `/track/:bookingId`, `/widget`.
`?src=` is recorded as the booking source for the session.

### Load test

```bash
SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon> pnpm load:booking
```

50 concurrent `create_booking` calls with distinct keys must yield 50 distinct, gap-free tickets;
50 with one key must yield one ticket. Needs `OTP_PROVIDER=mock` on the functions, and
`LOAD_TEST_SECRET` set both as a function secret and in the script's environment: the public
limit is 10 creates per IP per 10 minutes, so outside production that header swaps the IP key
for a per-request one. It is ignored when `APP_ENV=production`.

### End-to-end tests

`pnpm test:e2e` runs the portal flows against an in-memory fake of the booking API
(`e2e/fixtures/booking-api.ts`) so CI needs no secrets. `E2E_LIVE=1 pnpm test:e2e` runs the same
specs against the project in `.env.local` (fake-only scenarios are skipped).

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
  functions/<name>/index.ts  public Edge Functions (Deno entrypoints only; see the table above)
  functions/_shared/
    enums.ts, schemas.ts   shared with the client through the @shared alias
    otp.ts, sms/, payments/  codes + tokens (Web Crypto), SMS and payment provider interfaces + Mock adapters
    pricing/               pure quote engine (8 pricing types, zones, add-ons, deposit, tax) + fixtures
    availability/          pure slot generator (hours × skills × availability × assignments × reserved crew)
    handlers/              request handlers with injected deps (+ in-memory fakes for tests)
    runtime.ts             Deno plumbing shared by every entrypoint
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
