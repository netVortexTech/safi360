# Security Checklist (Phase 7)

Review this list before every production deploy. Tick each item; anything
unticked blocks the release.

## Row-Level Security (per table)

RLS is enabled on every table; `anon` has no direct table access (public
traffic goes through Edge Functions with the service role).

| Table                                                          | Policy summary                                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `plans`                                                        | `authenticated` SELECT when `active` or super-admin; writes service-role only |
| `tenants`                                                      | Members SELECT own tenant / super-admin all; OWNER UPDATE only                |
| `profiles`                                                     | Own row + same-tenant colleagues; self-UPDATE only                            |
| `memberships`                                                  | Tenant-visible; OWNER/MANAGER manage, OWNER grants OWNER, never self-edit     |
| `tenant_counters`, `tenant_integration_secrets`, `rate_limits` | No client access (RLS on, no policies, no grants)                             |
| `tenant_integrations`                                          | OWNER SELECT non-secret config; writes in Edge Functions                      |
| `audit_logs`                                                   | OWNER/MANAGER SELECT own tenant; INSERT via `app.write_audit` only            |
| `services`, `service_addons`, `service_zones`                  | Tenant members read active catalog; OWNER/MANAGER write                       |
| `staff`, `staff_availability`, `assignments`                   | Tenant roles read; OWNER/MANAGER write                                        |
| `customers`, `customer_addresses`                              | Tenant roles read/write own tenant; PII masked in logs/exports                |
| `bookings`, `booking_items`, `quotes`, `job_events`            | Tenant-scoped; transitions only via `transition_booking` RPC                  |
| `payments`                                                     | Restricted visibility (migration 0014); writes via `apply_payment_result` RPC |
| `message_threads`, `messages`, `notifications`                 | OWNER/MANAGER/DISPATCHER SELECT; resend UPDATE OWNER/MANAGER only             |
| `support_requests`, `support_messages`                         | Super-admin or tenant OWNER/MANAGER; messages inherit via parent request      |
| `notification_templates`                                       | Members SELECT; OWNER INSERT/UPDATE                                           |
| `impersonation_sessions`                                       | Super-admin only (SELECT/INSERT/UPDATE), every session records reason         |
| `customer_data_requests`                                       | Service-role only — no `authenticated` policies (deny by default)             |
| `system_health`                                                | Super-admin SELECT/INSERT only                                                |

## Hardening added by the 0031–0033 audit (2026-10-19)

- [ ] `APP_ENV=production` is SET on every hosted function — an unset `APP_ENV` behaves
      as sandbox, and with `OTP_PROVIDER=mock` every OTP would be 123456.
- [ ] `LOAD_TEST_SECRET` is NOT set in production (it relaxes per-IP limits in sandbox).
- [ ] seed.sql is never pushed to a project with real users: it seeds a super admin on a
      phone whose test OTP (123456) is in config.toml.
- [ ] `profiles.phone_e164` stays immutable to clients (0031); staff claiming reads
      `auth.users.phone` only.
- [ ] New tables revoke ALL from `public, anon, authenticated` before granting back
      (RLS does not cover TRUNCATE; 0032 fixed eight tables that missed this).
- [ ] The `job-evidence` bucket is private and its policies come from migration 0033,
      not from dashboard clicks.
- [ ] Access tokens expire in 1 hour (config.toml `jwt_expiry`) so revoked memberships
      lapse quickly.

## Secrets & transport

- [ ] No service-role key in client bundles — `VITE_*` exposes only URL + anon key.
- [ ] Uploads/downloads use signed URLs with short expiry, never public buckets for PII.
- [ ] HTTPS enforced (HSTS); `APP_ENV=production` disables mocks/sandbox bypasses.
- [ ] `SENTRY_DSN` (client) is optional; events scrubbed of `+255…` numbers and emails.

## Input & abuse protection

- [ ] All Edge Function bodies validated with zod (`parseBody`); field errors mapped, no stack leaks.
- [ ] Rate limits on OTP, tracking, booking and payment endpoints (per-IP + per-phone).
- [ ] Idempotency keys on booking create and payment apply; duplicate delivery is a no-op.
- [ ] `SENTRY_DSN`, `VITE_SENTRY_DSN` and OTP/provider secrets rotate via env, never in repo.

## Tenant isolation

- [ ] Tenant resolved from slug server-side; client-supplied tenant ids never trusted.
- [ ] JWT claims (`app.current_tenant_id()`, `app.has_tenant_role()`) gate every policy.
- [ ] Impersonation writes an `impersonation_sessions` row with admin, tenant, role, reason.

## Audit & privacy

- [ ] State transitions and payment results append `job_events` / `audit_logs` rows.
- [ ] OTP codes hashed, single-use, attempt-capped, short-lived; tokens HMAC-signed.
- [ ] Export/delete requests verified by OTP token, logged in `customer_data_requests`.
- [ ] Logs mask phone numbers (`+255XXX•••XXX`); no emails or full phones in Sentry/logs.

## Backups

- [ ] Nightly `pg_dump` succeeds; `scripts/verify-backup.sh` restores to a temp DB and
      compares row counts of `tenants`, `customers`, `bookings`, `payments`.
