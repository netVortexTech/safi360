-- 0036 · one guard_tenant_columns for both the control center and self-serve signup
--
-- 20261020000034_control_center and 20261023000034_self_serve_signup each replaced
-- app.guard_tenant_columns() with their own version. The later one (signup) won, which:
--   * dropped the app.in_control_write() bypass, so every control_* function that changes a
--     tenant's plan, status, trial or churn failed with immutable_column (activating a paying
--     company included);
--   * stopped guarding account_manager_id, churned_at and churn_reason, so a tenant could
--     edit its own churn and account-manager columns.
-- This version keeps both: service role and control writes pass, select_plan() may change
-- plan_id only, and every platform-managed column is immutable to everyone else.

create or replace function app.guard_tenant_columns()
returns trigger
language plpgsql
as $$
declare
  v_platform_write text := coalesce(current_setting('app.platform_tenant_write', true), '');
begin
  if app.is_service_role() or app.in_control_write() then
    return new;
  end if;
  if new.id                 is distinct from old.id
  or new.slug               is distinct from old.slug
  or new.ticket_prefix      is distinct from old.ticket_prefix
  or (new.plan_id           is distinct from old.plan_id and v_platform_write <> 'plan_id')
  or new.status             is distinct from old.status
  or new.trial_ends_at      is distinct from old.trial_ends_at
  or new.deleted_at         is distinct from old.deleted_at
  or new.created_at         is distinct from old.created_at
  or new.account_manager_id is distinct from old.account_manager_id
  or new.churned_at         is distinct from old.churned_at
  or new.churn_reason       is distinct from old.churn_reason then
    raise exception 'immutable_column' using errcode = '42501',
      hint = 'slug, ticket_prefix, plan, status, trial, churn and account manager are managed by the platform';
  end if;
  return new;
end;
$$;
