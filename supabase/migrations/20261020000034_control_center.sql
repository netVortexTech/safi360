-- 0034 · control center: platform billing, costs, flags, settings, incidents, subscription
-- history, and the super-admin functions behind /control.
--
-- Every new table is closed to client roles (RLS on, no grants). The control center reads
-- and writes only through the control_* functions below. Each one is SECURITY DEFINER, first
-- checks that the caller is a super admin with a platform role allowed to do the action
-- (same matrix as src/experiences/control/context.ts), and audits every write with a reason.
--
-- Money is integer TZS. "Today" and months are Dar es Salaam calendar dates (UTC+3, no DST).

-- ---------------------------------------------------------------------------
-- Time helpers (Dar es Salaam is a fixed UTC+3)
-- ---------------------------------------------------------------------------

create or replace function app.dar_date(p_at timestamptz)
returns date
language sql
immutable
as $$
  select ((p_at at time zone 'UTC') + interval '3 hours')::date;
$$;

create or replace function app.dar_today()
returns date
language sql
stable
as $$
  select app.dar_date(now());
$$;

/** Start of a Dar calendar day as an instant. */
create or replace function app.dar_start(p_day date)
returns timestamptz
language sql
immutable
as $$
  select (p_day::timestamp - interval '3 hours') at time zone 'UTC';
$$;

create or replace function app.month_start(p_day date)
returns date
language sql
immutable
as $$
  select date_trunc('month', p_day)::date;
$$;

-- ---------------------------------------------------------------------------
-- Platform staff roles
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column platform_role text
    check (platform_role in ('OWNER', 'FINANCE', 'SUPPORT', 'ENGINEER', 'ANALYST'));

update public.profiles set platform_role = 'OWNER' where is_super_admin and platform_role is null;

-- Set (transaction-local) by control_* write functions after their permission check, so
-- the column guards below let platform-managed columns change only through them.
create or replace function app.begin_control_write()
returns void
language sql
as $$
  select set_config('app.control_write', 'on', true);
$$;

create or replace function app.in_control_write()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.control_write', true), '') = 'on';
$$;

create or replace function app.guard_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if app.is_service_role() or app.in_control_write() then
    return new;
  end if;
  if new.is_super_admin is distinct from old.is_super_admin
  or new.platform_role  is distinct from old.platform_role
  or new.id             is distinct from old.id
  or new.phone_e164     is distinct from old.phone_e164 then
    raise exception 'immutable_column' using errcode = '42501';
  end if;
  return new;
end;
$$;

/** The caller's platform role, or null when they are not Safi360 staff. */
create or replace function app.platform_role()
returns text
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select case when app.is_super_admin() then coalesce(p.platform_role, 'OWNER') end
  from public.profiles p
  where p.id = app.current_user_id();
$$;

/** Mirrors CAPS in src/experiences/control/context.ts. */
create or replace function app.platform_can(p_cap text)
returns boolean
language sql
stable
as $$
  select coalesce(
    case app.platform_role()
      when 'OWNER' then true
      when 'FINANCE' then p_cap in ('revenue.view', 'billing.view', 'billing.manage', 'profit.view',
                                    'profit.manage', 'growth.view', 'audit.view')
      when 'SUPPORT' then p_cap in ('billing.view', 'company.manage', 'support.view', 'support.session')
      when 'ENGINEER' then p_cap in ('support.view', 'support.session', 'audit.view', 'flags.manage')
      when 'ANALYST' then p_cap in ('revenue.view', 'profit.view', 'growth.view')
    end,
    false);
$$;

/** Raise unless the caller is a super admin; with p_cap, also require that capability. */
create or replace function app.require_platform(p_cap text default null)
returns void
language plpgsql
stable
as $$
begin
  if not app.is_super_admin() or app.platform_role() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_cap is not null and not app.platform_can(p_cap) then
    raise exception 'forbidden' using errcode = '42501', hint = p_cap;
  end if;
end;
$$;

/** require_platform for write functions: also opens the guarded-column window for this transaction. */
create or replace function app.require_platform_write(p_cap text)
returns void
language plpgsql
as $$
begin
  perform app.require_platform(p_cap);
  perform app.begin_control_write();
end;
$$;

create or replace function app.require_reason(p_reason text)
returns text
language plpgsql
immutable
as $$
begin
  if p_reason is null or length(btrim(p_reason)) < 5 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenants: account manager and churn
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column account_manager_id uuid references public.profiles(id),
  add column churned_at timestamptz,
  add column churn_reason text
    check (churn_reason in ('price', 'low_volume', 'went_back_to_whatsapp', 'missing_feature',
                            'closed_business', 'other'));

create or replace function app.guard_tenant_columns()
returns trigger
language plpgsql
as $$
begin
  if app.is_service_role() or app.in_control_write() then
    return new;
  end if;
  if new.id                 is distinct from old.id
  or new.slug               is distinct from old.slug
  or new.ticket_prefix      is distinct from old.ticket_prefix
  or new.plan_id            is distinct from old.plan_id
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

-- ---------------------------------------------------------------------------
-- Subscription history: one row whenever a tenant's plan, status or churn changes.
-- MRR at any instant = the latest row per tenant at or before it. Feeds the MRR trend,
-- the movement waterfall, NRR and cohort retention.
-- ---------------------------------------------------------------------------

create table public.tenant_subscription_events (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references public.tenants(id),
  at         timestamptz not null default now(),
  plan_id    text,
  status     public.tenant_status not null,
  churned    boolean not null default false,
  mrr_tzs    integer not null default 0 check (mrr_tzs >= 0)
);

create index tenant_subscription_events_tenant_at_idx on public.tenant_subscription_events (tenant_id, at desc);

create index tenant_subscription_events_at_idx on public.tenant_subscription_events (at);

alter table public.tenant_subscription_events enable row level security;

revoke all on table public.tenant_subscription_events from public, anon, authenticated;

create or replace function app.tenant_mrr(p_plan_id text, p_status public.tenant_status, p_churned boolean)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when p_churned then 0
    when p_status in ('ACTIVE', 'PAST_DUE') then coalesce((select price_tzs from public.plans where id = p_plan_id), 0)
    else 0
  end;
$$;

create or replace function app.log_subscription_event()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_churned boolean := new.deleted_at is not null or new.churned_at is not null;
begin
  if tg_op = 'UPDATE'
     and new.plan_id is not distinct from old.plan_id
     and new.status = old.status
     and new.deleted_at is not distinct from old.deleted_at
     and new.churned_at is not distinct from old.churned_at then
    return new;
  end if;
  insert into public.tenant_subscription_events (tenant_id, at, plan_id, status, churned, mrr_tzs)
  values (new.id, case when tg_op = 'INSERT' then new.created_at else now() end,
          new.plan_id, new.status, v_churned, app.tenant_mrr(new.plan_id, new.status, v_churned));
  return new;
end;
$$;

create trigger tenants_log_subscription
  after insert or update on public.tenants
  for each row execute function app.log_subscription_event();

-- Backfill: the current state of every existing tenant, as of its signup.
insert into public.tenant_subscription_events (tenant_id, at, plan_id, status, churned, mrr_tzs)
select t.id, t.created_at, t.plan_id, t.status, t.deleted_at is not null,
       app.tenant_mrr(t.plan_id, t.status, t.deleted_at is not null)
from public.tenants t;

/** MRR per tenant at an instant. */
create or replace function app.mrr_by_tenant_at(p_at timestamptz)
returns table (tenant_id uuid, mrr_tzs integer, status public.tenant_status, churned boolean)
language sql
stable
as $$
  select distinct on (e.tenant_id) e.tenant_id, e.mrr_tzs, e.status, e.churned
  from public.tenant_subscription_events e
  where e.at <= p_at
  order by e.tenant_id, e.at desc, e.id desc;
$$;

create or replace function app.mrr_at(p_at timestamptz)
returns bigint
language sql
stable
as $$
  select coalesce(sum(mrr_tzs), 0)::bigint from app.mrr_by_tenant_at(p_at);
$$;

-- ---------------------------------------------------------------------------
-- Platform billing: invoices Safi360 sends companies, payments against them, credits
-- ---------------------------------------------------------------------------

create sequence public.platform_invoice_number_seq;

create table public.platform_invoices (
  id             uuid primary key default gen_random_uuid(),
  number         text not null unique,
  tenant_id      uuid not null references public.tenants(id),
  period         date not null check (extract(day from period) = 1),
  amount_tzs     integer not null check (amount_tzs >= 0),
  status         text not null default 'OPEN'
                   check (status in ('PAID', 'OPEN', 'FAILED', 'VOID', 'CREDITED')),
  issued_on      date not null default app.dar_today(),
  due_on         date not null,
  method         text,
  paid_at        timestamptz,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (tenant_id, period)
);

create index platform_invoices_tenant_idx on public.platform_invoices (tenant_id, period desc);

create index platform_invoices_status_idx on public.platform_invoices (status);

create table public.platform_payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  invoice_id   uuid references public.platform_invoices(id),
  amount_tzs   integer not null check (amount_tzs > 0),
  method       text not null check (method in ('Selcom', 'AzamPay', 'M-Pesa', 'Bank transfer', 'Cash')),
  status       text not null check (status in ('SUCCESS', 'FAILED', 'PENDING_APPROVAL', 'REJECTED')),
  result       text,                               -- provider failure reason
  reference    text,
  reason       text,                               -- why it was recorded by hand
  recorded_by  uuid references public.profiles(id),
  approved_by  uuid references public.profiles(id),
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index platform_payments_tenant_idx on public.platform_payments (tenant_id, occurred_at desc);

create index platform_payments_invoice_idx on public.platform_payments (invoice_id);

create table public.platform_credits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  invoice_id  uuid references public.platform_invoices(id),
  amount_tzs  integer not null check (amount_tzs > 0),
  reason      text not null,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

create index platform_credits_tenant_idx on public.platform_credits (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Costs (P&L), feature flags, settings, incidents
-- ---------------------------------------------------------------------------

create table public.platform_costs (
  month       date not null check (extract(day from month) = 1),
  category    text not null check (category in ('hosting', 'sms', 'whatsapp', 'payment_fees',
                                                'salaries', 'marketing', 'office', 'tools')),
  amount_tzs  integer not null check (amount_tzs >= 0),
  note        text,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  primary key (month, category)
);

create table public.feature_flags (
  key          text primary key check (key ~ '^[a-z][a-z0-9_]{1,59}$'),
  description  text not null default '',
  enabled      boolean not null default false,
  rollout      integer not null default 0 check (rollout between 0 and 100),
  plans        text[] not null default '{}',
  updated_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now()
);

create table public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now()
);

insert into public.platform_settings (key, value) values
  ('manual_payment_approval_threshold_tzs', '500000'),
  ('grace_days', '7'),
  ('invoice_due_days', '7'),
  -- Unit cost and resale price per usage unit. Defaults; edit under Audit & settings.
  ('rate_cards', '[
     {"key":"sms","unit":"message","cost_tzs":18,"price_tzs":25},
     {"key":"whatsapp_utility","unit":"conversation","cost_tzs":14,"price_tzs":20},
     {"key":"whatsapp_marketing","unit":"conversation","cost_tzs":72,"price_tzs":95},
     {"key":"selcom_fee","unit":"percent","cost_tzs":2,"price_tzs":2},
     {"key":"extra_staff_seat","unit":"seat_month","cost_tzs":0,"price_tzs":5000}
   ]');

create table public.platform_incidents (
  id           uuid primary key default gen_random_uuid(),
  service      text not null check (service in ('whatsapp', 'selcom', 'azampay', 'sms', 'jobs', 'database')),
  severity     text not null check (severity in ('minor', 'major')),
  title        text not null check (length(title) between 3 and 160),
  started_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  updates      jsonb not null default '[]'::jsonb,   -- [{at, text, by}]
  created_by   uuid references public.profiles(id)
);

create index platform_incidents_started_idx on public.platform_incidents (started_at desc);

-- Support: assignment, and the extra fields a support session carries.
alter table public.support_requests add column assignee_id uuid references public.profiles(id);

alter table public.impersonation_sessions
  add column mode text not null default 'read_only' check (mode in ('read_only', 'write')),
  add column ticket text,
  add column expires_at timestamptz;

alter table public.platform_invoices enable row level security;

alter table public.platform_payments enable row level security;

alter table public.platform_credits enable row level security;

alter table public.platform_costs enable row level security;

alter table public.feature_flags enable row level security;

alter table public.platform_settings enable row level security;

alter table public.platform_incidents enable row level security;

revoke all on table
  public.platform_invoices,
  public.platform_payments,
  public.platform_credits,
  public.platform_costs,
  public.feature_flags,
  public.platform_settings,
  public.platform_incidents
from public, anon, authenticated;

revoke all on sequence public.platform_invoice_number_seq from public, anon, authenticated;

create or replace function app.setting_value(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.platform_settings where key = p_key;
$$;

-- An OPEN invoice past its due date shows as OVERDUE.
create or replace function app.invoice_display_status(p_status text, p_due date)
returns text
language sql
stable
as $$
  select case when p_status = 'OPEN' and p_due < app.dar_today() then 'OVERDUE' else p_status end;
$$;

-- ---------------------------------------------------------------------------
-- Company facts: one row per tenant with everything the console lists
-- ---------------------------------------------------------------------------

create type app.company_fact as (
  id                  uuid,
  name                text,
  slug                text,
  ticket_prefix       text,
  city                text,
  plan_id             text,
  lifecycle           text,
  signup              date,
  trial_ends          date,
  mrr_tzs             integer,
  bookings_30d        integer,
  bookings_month      integer,
  staff_count         integer,
  whatsapp_month      integer,
  sms_month           integer,
  last_active         timestamptz,
  account_manager_id  uuid,
  account_manager     text,
  owner               text,
  phone               text,
  churn_reason        text,
  health              integer
);

create or replace function app.company_facts()
returns setof app.company_fact
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  with base as (
    select
      t.*,
      case
        when t.deleted_at is not null or t.churned_at is not null then 'CHURNED'
        else t.status::text
      end as lifecycle,
      p.limits as plan_limits
    from public.tenants t
    left join public.plans p on p.id = t.plan_id
  ),
  b as (
    select
      bk.tenant_id,
      count(*) filter (where bk.created_at >= now() - interval '30 days' and bk.status <> 'EXPIRED') as b30,
      count(*) filter (where bk.created_at >= app.dar_start(app.month_start(app.dar_today()))
                         and bk.status <> 'EXPIRED') as bmonth,
      max(bk.updated_at) as last_booking
    from public.bookings bk
    group by bk.tenant_id
  ),
  n as (
    select
      nt.tenant_id,
      count(*) filter (where nt.channel = 'WHATSAPP') as wa,
      count(*) filter (where nt.channel = 'SMS') as sms
    from public.notifications nt
    where nt.created_at >= app.dar_start(app.month_start(app.dar_today()))
      and nt.status <> 'failed'
    group by nt.tenant_id
  ),
  s as (
    select st.tenant_id, count(*) filter (where st.active) as staff
    from public.staff st
    group by st.tenant_id
  ),
  sv as (
    select tenant_id, count(*) as services from public.services group by tenant_id
  ),
  a as (
    select al.tenant_id, max(al.created_at) as last_audit
    from public.audit_logs al
    where al.tenant_id is not null
    group by al.tenant_id
  ),
  o as (
    select distinct on (m.tenant_id) m.tenant_id, pr.name, pr.phone_e164
    from public.memberships m
    join public.profiles pr on pr.id = m.user_id
    where m.role = 'OWNER'
    order by m.tenant_id, m.active desc, m.created_at
  ),
  f as (
    select
      base.*,
      coalesce(b.b30, 0)::integer as b30,
      coalesce(b.bmonth, 0)::integer as bmonth,
      coalesce(s.staff, 0)::integer as staff,
      coalesce(sv.services, 0)::integer as services,
      coalesce(n.wa, 0)::integer as wa,
      coalesce(n.sms, 0)::integer as sms,
      greatest(base.created_at, b.last_booking, a.last_audit) as last_active,
      o.name as owner_name,
      o.phone_e164 as owner_phone
    from base
    left join b on b.tenant_id = base.id
    left join n on n.tenant_id = base.id
    left join s on s.tenant_id = base.id
    left join sv on sv.tenant_id = base.id
    left join a on a.tenant_id = base.id
    left join o on o.tenant_id = base.id
  )
  select
    f.id,
    f.name,
    f.slug,
    f.ticket_prefix,
    f.city,
    f.plan_id,
    f.lifecycle,
    app.dar_date(f.created_at),
    app.dar_date(f.trial_ends_at),
    app.tenant_mrr(f.plan_id, f.status, f.lifecycle = 'CHURNED'),
    f.b30,
    f.bmonth,
    f.staff,
    f.wa,
    f.sms,
    f.last_active,
    f.account_manager_id,
    am.name,
    f.owner_name,
    coalesce(f.owner_phone, f.phone_e164),
    f.churn_reason,
    -- Health 0–100: activity vs plan (40) + recency (30) + billing (20) + setup (10).
    (case when f.lifecycle = 'CHURNED' then 0 else
      least(40, round(40.0 * f.b30 / greatest(1, coalesce((f.plan_limits ->> 'bookings_month')::numeric, 150) * 0.25)))::integer
      + case
          when f.last_active >= now() - interval '2 days' then 30
          when f.last_active >= now() - interval '7 days' then 20
          when f.last_active >= now() - interval '14 days' then 10
          else 0
        end
      + case when f.status in ('PAST_DUE', 'SUSPENDED') then 0 else 20 end
      + case when f.staff > 0 then 5 else 0 end
      + case when f.services > 0 then 5 else 0 end
    end)::integer
  from f
  left join public.profiles am on am.id = f.account_manager_id;
$$;

create or replace function app.company_json(c app.company_fact)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.slug,
    'ticket_prefix', c.ticket_prefix,
    'city', coalesce(c.city, ''),
    'plan', c.plan_id,
    'lifecycle', c.lifecycle,
    'signup', c.signup,
    'trial_ends', c.trial_ends,
    'mrr_tzs', c.mrr_tzs,
    'bookings_30d', c.bookings_30d,
    'health', c.health,
    'last_active', c.last_active,
    'account_manager', c.account_manager,
    'account_manager_id', c.account_manager_id,
    'owner', c.owner,
    'phone', c.phone,
    'churn_reason', c.churn_reason,
    'usage', jsonb_build_object(
      'bookings', c.bookings_month,
      'staff', c.staff_count,
      'whatsapp', c.whatsapp_month,
      'sms', c.sms_month
    )
  );
$$;

create or replace function app.plan_json(p public.plans, p_companies integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'price_tzs', p.price_tzs,
    'active', p.active,
    'companies', p_companies,
    'limits', jsonb_build_object(
      'bookings', (p.limits ->> 'bookings_month')::integer,
      'staff', (p.limits ->> 'staff')::integer,
      'whatsapp', (p.limits ->> 'whatsapp_month')::integer,
      'sms', (p.limits ->> 'sms_month')::integer,
      'branches', (p.limits ->> 'branches')::integer
    )
  );
$$;

/** Attention items: failed renewals, trials ending, churn risk, broken integrations. */
create or replace function app.attention_items()
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  with facts as (select * from app.company_facts()),
  renewal as (
    select
      'renewal_failed:' || i.id as id,
      'renewal_failed' as kind,
      i.tenant_id as company_id,
      jsonb_build_object(
        'provider', coalesce(lp.method, i.method, ''),
        'reason', coalesce(lp.result, ''),
        'retries', coalesce(fc.n, 0),
        'invoice', i.number
      ) as params,
      i.amount_tzs,
      coalesce(lp.occurred_at, app.dar_start(i.due_on)) as at
    from public.platform_invoices i
    left join lateral (
      select pp.method, pp.result, pp.occurred_at from public.platform_payments pp
      where pp.invoice_id = i.id and pp.status = 'FAILED'
      order by pp.occurred_at desc limit 1
    ) lp on true
    left join lateral (
      select count(*) as n from public.platform_payments pp where pp.invoice_id = i.id and pp.status = 'FAILED'
    ) fc on true
    where i.status = 'FAILED' or app.invoice_display_status(i.status, i.due_on) = 'OVERDUE'
  ),
  trial as (
    select
      'trial_ending:' || f.id, 'trial_ending', f.id,
      jsonb_build_object('ends', f.trial_ends, 'bookings', f.bookings_30d),
      null::integer,
      now()
    from facts f
    where f.lifecycle = 'TRIAL' and f.trial_ends is not null and f.trial_ends <= app.dar_today() + 7
  ),
  risk as (
    select
      'churn_risk:' || f.id, 'churn_risk', f.id,
      jsonb_build_object('days_inactive', greatest(0, app.dar_today() - app.dar_date(f.last_active)), 'health', f.health),
      null::integer,
      f.last_active
    from facts f
    where f.lifecycle in ('ACTIVE', 'PAST_DUE')
      and (f.health < 40 or f.last_active < now() - interval '7 days')
  ),
  integ as (
    select
      'integration_down:' || ti.tenant_id || ':' || ti.kind, 'integration_down', ti.tenant_id,
      jsonb_build_object('integration', lower(ti.kind)),
      null::integer,
      ti.updated_at
    from public.tenant_integrations ti
    join public.tenants t on t.id = ti.tenant_id and t.deleted_at is null and t.churned_at is null
    where ti.status = 'ERROR'
  ),
  allx as (
    select * from renewal union all select * from trial union all select * from risk union all select * from integ
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'kind', x.kind, 'company_id', x.company_id, 'params', x.params,
    'amount_tzs', x.amount_tzs, 'at', x.at) order by x.at desc), '[]'::jsonb)
  from allx x;
$$;

/** Billed (invoices by period) vs collected (successful payments by Dar month). */
create or replace function app.billed_collected(p_months integer)
returns jsonb
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  with months as (
    select (app.month_start(app.dar_today()) - make_interval(months => g))::date as m
    from generate_series(p_months - 1, 0, -1) g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(months.m, 'YYYY-MM'),
    'billed', coalesce((select sum(i.amount_tzs) from public.platform_invoices i
                        where i.period = months.m and i.status <> 'VOID'), 0),
    'collected', coalesce((select sum(pp.amount_tzs) from public.platform_payments pp
                           where pp.status = 'SUCCESS' and app.month_start(app.dar_date(pp.occurred_at)) = months.m), 0)
  ) order by months.m), '[]'::jsonb)
  from months;
$$;

-- ===========================================================================
-- READ functions
-- ===========================================================================

create or replace function public.control_me()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v jsonb;
begin
  perform app.require_platform();
  select jsonb_build_object(
    'id', p.id,
    'name', coalesce(p.name, u.email, p.email, 'Safi360'),
    'email', coalesce(u.email, p.email),
    'role', app.platform_role()
  ) into v
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = app.current_user_id();
  return v;
end;
$$;

create or replace function public.control_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform();
  return (
    select coalesce(jsonb_agg(app.plan_json(p, coalesce(c.n, 0)) order by p.price_tzs), '[]'::jsonb)
    from public.plans p
    left join (
      select plan_id, count(*)::integer as n from app.company_facts()
      where lifecycle in ('ACTIVE', 'PAST_DUE', 'TRIAL') group by plan_id
    ) c on c.plan_id = p.id
  );
end;
$$;

create or replace function public.control_companies()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform();
  return (
    select coalesce(jsonb_agg(app.company_json(f) order by f.signup desc, f.name), '[]'::jsonb)
    from app.company_facts() f
  );
end;
$$;

create or replace function public.control_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_from   timestamptz := app.dar_start(p_from);
  v_to     timestamptz := app.dar_start(p_to + 1);
  v_len    interval := app.dar_start(p_to + 1) - app.dar_start(p_from);
  v_month  date := app.month_start(app.dar_today());
  v_last   date := (app.month_start(app.dar_today()) - interval '1 month')::date;
  v_prev   date := (app.month_start(app.dar_today()) - interval '2 months')::date;
  v_now    record;
  v_start  record;
  v_kpis   jsonb;
  v_net_last bigint;
  v_net_prev bigint;
  v_mrr_now bigint;
  v_mrr_start bigint;
  v_col    bigint;
  v_col_prev bigint;
  v_bk     bigint;
  v_bk_prev bigint;
  v_created bigint;
  v_created_prev bigint;
begin
  perform app.require_platform();

  select
    count(*) filter (where mrr_tzs > 0) as paying,
    count(*) filter (where status = 'TRIAL' and not churned) as trials,
    count(*) filter (where status = 'PAST_DUE' and not churned) as past_due
  into v_now from app.mrr_by_tenant_at(now());
  select
    count(*) filter (where mrr_tzs > 0) as paying,
    count(*) filter (where status = 'TRIAL' and not churned) as trials,
    count(*) filter (where status = 'PAST_DUE' and not churned) as past_due
  into v_start from app.mrr_by_tenant_at(v_from);

  v_mrr_now := app.mrr_at(now());
  v_mrr_start := app.mrr_at(v_from);

  select count(*) into v_created from public.tenants where created_at >= v_from and created_at < v_to;
  select count(*) into v_created_prev from public.tenants where created_at >= v_from - v_len and created_at < v_from;

  select coalesce(sum(amount_tzs), 0) into v_col from public.platform_payments
  where status = 'SUCCESS' and occurred_at >= v_from and occurred_at < v_to;
  select coalesce(sum(amount_tzs), 0) into v_col_prev from public.platform_payments
  where status = 'SUCCESS' and occurred_at >= v_from - v_len and occurred_at < v_from;

  select count(*) into v_bk from public.bookings
  where created_at >= v_from and created_at < v_to and status <> 'EXPIRED';
  select count(*) into v_bk_prev from public.bookings
  where created_at >= v_from - v_len and created_at < v_from and status <> 'EXPIRED';

  v_net_last := app.net_profit(v_last);
  v_net_prev := app.net_profit(v_prev);

  v_kpis := jsonb_build_object(
    'companies_created', v_created,
    'paying', v_now.paying,
    'trials', v_now.trials,
    'past_due', v_now.past_due,
    'mrr_tzs', v_mrr_now,
    'collected_month_tzs', v_col,
    'net_profit_last_month_tzs', v_net_last,
    'net_profit_month', to_char(v_last, 'YYYY-MM'),
    'bookings_processed', v_bk,
    'deltas', jsonb_build_object(
      'companies_created', v_created - v_created_prev,
      'paying', v_now.paying - v_start.paying,
      'trials', v_now.trials - v_start.trials,
      'past_due', v_now.past_due - v_start.past_due,
      'mrr_tzs', case when v_mrr_start > 0 then round((v_mrr_now - v_mrr_start) * 100.0 / v_mrr_start, 1) end,
      'collected_month_tzs', case when v_col_prev > 0 then round((v_col - v_col_prev) * 100.0 / v_col_prev, 1) end,
      'net_profit_last_month_tzs', case when v_net_prev <> 0 then round((v_net_last - v_net_prev) * 100.0 / abs(v_net_prev), 1) end,
      'bookings_processed', case when v_bk_prev > 0 then round((v_bk - v_bk_prev) * 100.0 / v_bk_prev, 1) end
    )
  );

  return jsonb_build_object(
    'kpis', v_kpis,
    'mrr_series', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'mrr', app.mrr_at(least(now(), app.dar_start((m + interval '1 month')::date))))
        order by m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(11, 0, -1) g) months
    ),
    'signups_weekly', (
      select jsonb_agg(jsonb_build_object(
        'week', w,
        'signups', (select count(*) from public.tenants t
                    where app.dar_date(t.created_at) >= w and app.dar_date(t.created_at) < w + 7))
        order by w)
      from (
        select (date_trunc('week', app.dar_today()::timestamp)::date - 7 * g) as w
        from generate_series(11, 0, -1) g
      ) weeks
    ),
    'billed_collected', app.billed_collected(6),
    'attention', app.attention_items()
  );
end;
$$;

/** Net operating profit for a month: collected − direct costs − opex. */
create or replace function app.net_profit(p_month date)
returns bigint
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select
    coalesce((select sum(amount_tzs) from public.platform_payments
              where status = 'SUCCESS' and app.month_start(app.dar_date(occurred_at)) = p_month), 0)
    - coalesce((select sum(amount_tzs) from public.platform_costs where month = p_month), 0);
$$;

create or replace function public.control_revenue(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_from  timestamptz := app.dar_start(p_from);
  v_to    timestamptz := least(now(), app.dar_start(p_to + 1));
  v_len   interval := app.dar_start(p_to + 1) - app.dar_start(p_from);
  v_mv    record;
  v_mrr   bigint;
  v_mrr_prev bigint;
  v_paying integer;
  v_paying_prev integer;
  v_nrr   numeric;
  v_nrr_prev numeric;
begin
  perform app.require_platform('revenue.view');

  with s as (select * from app.mrr_by_tenant_at(v_from)),
       e as (select * from app.mrr_by_tenant_at(v_to)),
       j as (
         select
           coalesce(s.mrr_tzs, 0) as a,
           coalesce(e.mrr_tzs, 0) as b,
           exists (select 1 from public.tenant_subscription_events x
                   where x.tenant_id = coalesce(e.tenant_id, s.tenant_id) and x.at <= v_from and x.mrr_tzs > 0) as paid_before
         from s full join e on e.tenant_id = s.tenant_id
       )
  select
    coalesce(sum(a), 0) as start_tzs,
    coalesce(sum(b) filter (where a = 0 and b > 0 and not paid_before), 0) as new_tzs,
    coalesce(sum(b - a) filter (where a > 0 and b > a), 0) as expansion_tzs,
    coalesce(sum(b - a) filter (where a > 0 and b > 0 and b < a), 0) as contraction_tzs,
    coalesce(sum(-a) filter (where a > 0 and b = 0), 0) as churn_tzs,
    coalesce(sum(b) filter (where a = 0 and b > 0 and paid_before), 0) as reactivation_tzs,
    coalesce(sum(b), 0) as end_tzs
  into v_mv from j;

  v_mrr := v_mv.end_tzs;
  v_mrr_prev := v_mv.start_tzs;
  select count(*) filter (where mrr_tzs > 0) into v_paying from app.mrr_by_tenant_at(v_to);
  select count(*) filter (where mrr_tzs > 0) into v_paying_prev from app.mrr_by_tenant_at(v_from);

  v_nrr := case when v_mv.start_tzs > 0 then
    round((v_mv.start_tzs + v_mv.expansion_tzs + v_mv.contraction_tzs + v_mv.churn_tzs) * 100.0 / v_mv.start_tzs, 1) end;
  v_nrr_prev := app.nrr_between(v_from - v_len, v_from);

  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'mrr_tzs', v_mrr,
      'arr_tzs', v_mrr * 12,
      'arpa_tzs', case when v_paying > 0 then round(v_mrr::numeric / v_paying) else 0 end,
      'nrr_pct', v_nrr,
      'deltas', jsonb_build_object(
        'mrr_tzs', case when v_mrr_prev > 0 then round((v_mrr - v_mrr_prev) * 100.0 / v_mrr_prev, 1) end,
        'arr_tzs', case when v_mrr_prev > 0 then round((v_mrr - v_mrr_prev) * 100.0 / v_mrr_prev, 1) end,
        'arpa_tzs', case when v_paying > 0 and v_paying_prev > 0 and v_mrr_prev > 0 then
          round(((v_mrr::numeric / v_paying) - (v_mrr_prev::numeric / v_paying_prev)) * 100.0
                / (v_mrr_prev::numeric / v_paying_prev), 1) end,
        'nrr_pct', case when v_nrr is not null and v_nrr_prev is not null then v_nrr - v_nrr_prev end
      )
    ),
    'movement', jsonb_build_object(
      'start_tzs', v_mv.start_tzs,
      'new_tzs', v_mv.new_tzs,
      'expansion_tzs', v_mv.expansion_tzs,
      'contraction_tzs', v_mv.contraction_tzs,
      'churn_tzs', v_mv.churn_tzs,
      'reactivation_tzs', v_mv.reactivation_tzs,
      'end_tzs', v_mv.end_tzs
    ),
    'by_plan', (
      select coalesce(jsonb_agg(jsonb_build_object('plan', p.name, 'companies', coalesce(x.n, 0), 'mrr', coalesce(x.mrr, 0))
                                order by p.price_tzs), '[]'::jsonb)
      from public.plans p
      left join (
        select f.plan_id, count(*) filter (where f.mrr_tzs > 0) as n, sum(f.mrr_tzs) as mrr
        from app.company_facts() f group by f.plan_id
      ) x on x.plan_id = p.id
    ),
    'billed_collected', app.billed_collected(6),
    'aging', (
      with open_inv as (
        select i.amount_tzs - coalesce((select sum(pp.amount_tzs) from public.platform_payments pp
                                        where pp.invoice_id = i.id and pp.status = 'SUCCESS'), 0) as due_tzs,
               app.dar_today() - i.due_on as days
        from public.platform_invoices i
        where i.status in ('OPEN', 'FAILED')
      )
      select jsonb_build_array(
        jsonb_build_object('bucket', '0_7', 'amount_tzs', coalesce(sum(due_tzs) filter (where days <= 7), 0),
                           'invoices', count(*) filter (where days <= 7)),
        jsonb_build_object('bucket', '8_30', 'amount_tzs', coalesce(sum(due_tzs) filter (where days between 8 and 30), 0),
                           'invoices', count(*) filter (where days between 8 and 30)),
        jsonb_build_object('bucket', '30_plus', 'amount_tzs', coalesce(sum(due_tzs) filter (where days > 30), 0),
                           'invoices', count(*) filter (where days > 30))
      )
      from open_inv where due_tzs > 0
    )
  );
end;
$$;

create or replace function app.nrr_between(p_from timestamptz, p_to timestamptz)
returns numeric
language sql
stable
as $$
  with s as (select * from app.mrr_by_tenant_at(p_from) where mrr_tzs > 0),
       e as (select * from app.mrr_by_tenant_at(p_to))
  select case when sum(s.mrr_tzs) > 0 then
    round(sum(coalesce(e.mrr_tzs, 0)) * 100.0 / sum(s.mrr_tzs), 1) end
  from s left join e on e.tenant_id = s.tenant_id;
$$;

create or replace function public.control_billing()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_grace integer := coalesce((app.setting_value('grace_days'))::integer, 7);
begin
  perform app.require_platform('billing.view');
  return jsonb_build_object(
    'threshold_tzs', coalesce((app.setting_value('manual_payment_approval_threshold_tzs'))::integer, 500000),
    'invoices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'company_id', i.tenant_id, 'period', to_char(i.period, 'YYYY-MM'),
        'amount_tzs', i.amount_tzs, 'status', app.invoice_display_status(i.status, i.due_on),
        'issued', i.issued_on, 'due', i.due_on, 'method', i.method,
        'paid_tzs', coalesce((select sum(pp.amount_tzs) from public.platform_payments pp
                              where pp.invoice_id = i.id and pp.status = 'SUCCESS'), 0)
      ) order by i.issued_on desc, i.number desc), '[]'::jsonb)
      from public.platform_invoices i
    ),
    'failed', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'invoice', i.number, 'company_id', i.tenant_id, 'amount_tzs', i.amount_tzs,
        'provider', coalesce((select pp.method from public.platform_payments pp where pp.invoice_id = i.id
                              order by pp.occurred_at desc limit 1), i.method, ''),
        'attempts', (select coalesce(jsonb_agg(jsonb_build_object('at', pp.occurred_at, 'result', coalesce(pp.result, pp.status))
                                               order by pp.occurred_at), '[]'::jsonb)
                     from public.platform_payments pp where pp.invoice_id = i.id and pp.status = 'FAILED'),
        'next_retry', i.next_retry_at
      ) order by i.due_on), '[]'::jsonb)
      from public.platform_invoices i
      where i.status = 'FAILED'
    ),
    'grace', (
      select coalesce(jsonb_agg(g order by g ->> 'ends'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'company_id', i.tenant_id,
          'ends', min(i.due_on) + v_grace,
          'days_left', (min(i.due_on) + v_grace) - app.dar_today(),
          'outstanding_tzs', sum(i.amount_tzs) - coalesce(sum(pd.paid), 0)
        ) as g
        from public.platform_invoices i
        join public.tenants t on t.id = i.tenant_id
        left join lateral (
          select sum(pp.amount_tzs) as paid from public.platform_payments pp
          where pp.invoice_id = i.id and pp.status = 'SUCCESS'
        ) pd on true
        where i.status in ('OPEN', 'FAILED') and i.due_on < app.dar_today()
          and t.status <> 'SUSPENDED' and t.churned_at is null and t.deleted_at is null
        group by i.tenant_id
      ) x
    ),
    'pending_approvals', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pp.id, 'company_id', pp.tenant_id, 'invoice_id', pp.invoice_id, 'amount_tzs', pp.amount_tzs,
        'method', pp.method, 'reference', pp.reference, 'reason', pp.reason, 'at', pp.occurred_at,
        'recorded_by', coalesce(pr.name, pr.email), 'recorded_by_id', pp.recorded_by
      ) order by pp.occurred_at), '[]'::jsonb)
      from public.platform_payments pp
      left join public.profiles pr on pr.id = pp.recorded_by
      where pp.status = 'PENDING_APPROVAL'
    )
  );
end;
$$;

create or replace function public.control_profit(p_months integer default 4)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_month date := app.month_start(app.dar_today());
  v_cards jsonb := coalesce(app.setting_value('rate_cards'), '[]'::jsonb);
  v_sms numeric;
  v_wa numeric;
  v_fee_pct numeric;
  v_mkt bigint;
  v_new integer;
  v_mkt_prev bigint;
  v_new_prev integer;
  v_arpa numeric;
begin
  perform app.require_platform('profit.view');

  select (c ->> 'cost_tzs')::numeric into v_sms from jsonb_array_elements(v_cards) c where c ->> 'key' = 'sms';
  select (c ->> 'cost_tzs')::numeric into v_wa from jsonb_array_elements(v_cards) c where c ->> 'key' = 'whatsapp_utility';
  select (c ->> 'cost_tzs')::numeric into v_fee_pct from jsonb_array_elements(v_cards) c where c ->> 'key' = 'selcom_fee';

  -- CAC: marketing spend over the last 3 closed months / companies that started paying then.
  select coalesce(sum(amount_tzs), 0) into v_mkt from public.platform_costs
  where category = 'marketing' and month >= (v_month - interval '3 months')::date and month < v_month;
  select count(distinct tenant_id) into v_new from public.tenant_subscription_events e
  where e.mrr_tzs > 0 and e.at >= app.dar_start((v_month - interval '3 months')::date) and e.at < app.dar_start(v_month)
    and not exists (select 1 from public.tenant_subscription_events x where x.tenant_id = e.tenant_id and x.mrr_tzs > 0 and x.at < e.at);
  select coalesce(sum(amount_tzs), 0) into v_mkt_prev from public.platform_costs
  where category = 'marketing' and month >= (v_month - interval '6 months')::date and month < (v_month - interval '3 months')::date;
  select count(distinct tenant_id) into v_new_prev from public.tenant_subscription_events e
  where e.mrr_tzs > 0 and e.at >= app.dar_start((v_month - interval '6 months')::date)
    and e.at < app.dar_start((v_month - interval '3 months')::date)
    and not exists (select 1 from public.tenant_subscription_events x where x.tenant_id = e.tenant_id and x.mrr_tzs > 0 and x.at < e.at);
  select case when count(*) filter (where mrr_tzs > 0) > 0
              then sum(mrr_tzs)::numeric / count(*) filter (where mrr_tzs > 0) end
  into v_arpa from app.mrr_by_tenant_at(now());

  return jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'closed', m < v_month,
        'collected_tzs', coalesce((select sum(amount_tzs) from public.platform_payments
                                   where status = 'SUCCESS' and app.month_start(app.dar_date(occurred_at)) = m), 0),
        'direct', jsonb_build_object(
          'hosting', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'hosting'), 0),
          'sms', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'sms'), 0),
          'whatsapp', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'whatsapp'), 0),
          'payment_fees', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'payment_fees'), 0)
        ),
        'opex', jsonb_build_object(
          'salaries', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'salaries'), 0),
          'marketing', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'marketing'), 0),
          'office', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'office'), 0),
          'tools', coalesce((select amount_tzs from public.platform_costs where month = m and category = 'tools'), 0)
        )
      ) order by m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(greatest(p_months, 1) - 1, 0, -1) g) months
    ),
    -- This month per company: collected revenue vs usage cost at the rate-card unit costs.
    'contribution', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'company_id', f.id,
        'revenue_tzs', coalesce(r.collected, 0),
        'cost_to_serve_tzs', round(f.sms_month * coalesce(v_sms, 0) + f.whatsapp_month * coalesce(v_wa, 0)
                                   + coalesce(r.collected, 0) * coalesce(v_fee_pct, 0) / 100.0)::integer
      ) order by coalesce(r.collected, 0) desc, f.name), '[]'::jsonb)
      from app.company_facts() f
      left join (
        select tenant_id, sum(amount_tzs) as collected from public.platform_payments
        where status = 'SUCCESS' and app.month_start(app.dar_date(occurred_at)) = v_month
        group by tenant_id
      ) r on r.tenant_id = f.id
      where f.lifecycle <> 'CHURNED'
    ),
    'unit', jsonb_build_object(
      'cac_tzs', case when v_new > 0 then round(v_mkt::numeric / v_new) end,
      'payback_months', case when v_new > 0 and v_arpa > 0 then round((v_mkt::numeric / v_new) / v_arpa, 1) end,
      'cac_delta_pct', case when v_new > 0 and v_new_prev > 0 and v_mkt_prev > 0 then
        round(((v_mkt::numeric / v_new) - (v_mkt_prev::numeric / v_new_prev)) * 100.0 / (v_mkt_prev::numeric / v_new_prev), 1) end
    )
  );
end;
$$;

create or replace function public.control_growth()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_month date := app.month_start(app.dar_today());
begin
  perform app.require_platform('growth.view');
  return jsonb_build_object(
    'funnel', (
      with t as (
        select tn.id,
               exists (select 1 from public.bookings b where b.tenant_id = tn.id) as activated,
               (select min(e.at) from public.tenant_subscription_events e where e.tenant_id = tn.id and e.mrr_tzs > 0) as first_paid
        from public.tenants tn
      )
      select jsonb_build_array(
        jsonb_build_object('stage', 'created', 'count', count(*)),
        jsonb_build_object('stage', 'activated', 'count', count(*) filter (where activated)),
        jsonb_build_object('stage', 'converted', 'count', count(*) filter (where first_paid is not null)),
        jsonb_build_object('stage', 'retained_3m', 'count', count(*) filter (
          where first_paid is not null and first_paid <= now() - interval '3 months'
            and (select m.mrr_tzs from app.mrr_by_tenant_at(first_paid + interval '3 months') m where m.tenant_id = t.id) > 0))
      )
      from t
    ),
    -- Share of each signup cohort paying at the end of month 0, 1, 2… (last 6 cohorts).
    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object('cohort', to_char(c.m, 'YYYY-MM'), 'size', c.size, 'months', c.months)
                                order by c.m), '[]'::jsonb)
      from (
        select cm.m,
               (select count(*) from public.tenants t where app.month_start(app.dar_date(t.created_at)) = cm.m) as size,
               (
                 select coalesce(jsonb_agg(
                   case when tot = 0 then 0 else round(paying * 100.0 / tot) end order by k), '[]'::jsonb)
                 from (
                   select k,
                          (select count(*) from public.tenants t where app.month_start(app.dar_date(t.created_at)) = cm.m) as tot,
                          (select count(*) from app.mrr_by_tenant_at(least(now(), app.dar_start((cm.m + make_interval(months => k + 1))::date))) x
                           join public.tenants t on t.id = x.tenant_id
                           where app.month_start(app.dar_date(t.created_at)) = cm.m and x.mrr_tzs > 0) as paying
                   from generate_series(0, ((extract(year from age(v_month, cm.m)) * 12 + extract(month from age(v_month, cm.m)))::integer)) k
                 ) ks
               ) as months
        from (select (v_month - make_interval(months => g))::date as m from generate_series(5, 0, -1) g) cm
      ) c
      where c.size > 0
    ),
    'churn_reasons', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc), '[]'::jsonb)
      from (select coalesce(churn_reason, 'other') as reason, count(*) as n from public.tenants
            where churned_at is not null or deleted_at is not null group by 1) r
    )
  );
end;
$$;

create or replace function public.control_usage(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_from  timestamptz := app.dar_start(p_from);
  v_to    timestamptz := app.dar_start(p_to + 1);
  v_month date := app.month_start(app.dar_today());
begin
  perform app.require_platform();
  return jsonb_build_object(
    'by_source', (
      select coalesce(jsonb_agg(jsonb_build_object('source', source, 'bookings', n) order by n desc), '[]'::jsonb)
      from (select b.source::text as source, count(*) as n from public.bookings b
            where b.created_at >= v_from and b.created_at < v_to and b.status <> 'EXPIRED' group by 1) s
    ),
    'by_city', (
      select coalesce(jsonb_agg(jsonb_build_object('city', city, 'bookings', n) order by n desc), '[]'::jsonb)
      from (select coalesce(nullif(t.city, ''), 'Other') as city, count(*) as n
            from public.bookings b join public.tenants t on t.id = b.tenant_id
            where b.created_at >= v_from and b.created_at < v_to and b.status <> 'EXPIRED' group by 1) c
    ),
    'gmv', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'booked', coalesce((select sum(b.total_tzs) from public.bookings b
                            where app.month_start(app.dar_date(b.created_at)) = m
                              and b.status not in ('CANCELLED', 'EXPIRED', 'QUOTE_REJECTED', 'NO_SHOW')), 0),
        'collected', coalesce((select sum(p.amount_tzs) from public.payments p
                               where p.status = 'SUCCESS' and app.month_start(app.dar_date(coalesce(p.completed_at, p.created_at))) = m), 0)
      ) order by m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(5, 0, -1) g) months
    ),
    'messaging', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'whatsapp', (select count(*) from public.notifications n where n.channel = 'WHATSAPP' and n.status <> 'failed'
                       and app.month_start(app.dar_date(n.created_at)) = m),
        'sms', (select count(*) from public.notifications n where n.channel = 'SMS' and n.status <> 'failed'
                  and app.month_start(app.dar_date(n.created_at)) = m)
      ) order by m)
      from (select (v_month - make_interval(months => g))::date as m from generate_series(5, 0, -1) g) months
    )
  );
end;
$$;

/**
 * Service status: the newest system_health sample (metric 'service.<key>', value
 * {status, latency_ms}) if it is under an hour old, otherwise derived from the last 24h of
 * payments and notifications. Uptime is the share of non-DOWN samples over 30 days.
 */
create or replace function public.control_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform();
  return jsonb_build_object(
    'services', (
      with keys(key, ord) as (
        values ('whatsapp', 1), ('selcom', 2), ('azampay', 3), ('sms', 4), ('jobs', 5), ('database', 6)
      ),
      latest as (
        select distinct on (metric_name) substr(metric_name, 9) as key, metric_value, recorded_at
        from public.system_health
        where metric_name like 'service.%'
        order by metric_name, recorded_at desc
      ),
      uptime as (
        select substr(metric_name, 9) as key,
               round(100.0 * count(*) filter (where metric_value ->> 'status' <> 'DOWN') / count(*), 2) as pct
        from public.system_health
        where metric_name like 'service.%' and recorded_at >= now() - interval '30 days'
        group by 1
      ),
      pay as (
        select lower(provider) as key, count(*) as n, count(*) filter (where status = 'FAILED') as failed
        from public.payments
        where created_at >= now() - interval '24 hours' and provider in ('SELCOM', 'AZAMPAY')
        group by 1
      ),
      msg as (
        select lower(channel) as key, count(*) as n, count(*) filter (where status = 'failed') as failed
        from public.notifications
        where created_at >= now() - interval '24 hours'
        group by 1
      ),
      stuck as (
        select count(*) as n from public.notifications
        where status = 'queued' and scheduled_for < now() - interval '15 minutes'
      ),
      derived as (
        select k.key, k.ord,
          case
            when k.key = 'database' then 'HEALTHY'
            when k.key = 'jobs' then case when (select n from stuck) > 0 then 'DEGRADED' else 'HEALTHY' end
            else (
              select case
                when coalesce(x.n, 0) = 0 then 'HEALTHY'
                when x.failed = x.n and x.n >= 5 then 'DOWN'
                when x.failed * 5 > x.n then 'DEGRADED'
                else 'HEALTHY'
              end
              from (select n, failed from pay where pay.key = k.key
                    union all select n, failed from msg where msg.key = k.key) x
              limit 1
            )
          end as status
        from keys k
      )
      select jsonb_agg(jsonb_build_object(
        'key', d.key,
        'status', case when l.recorded_at >= now() - interval '1 hour' then l.metric_value ->> 'status'
                       else coalesce(d.status, 'HEALTHY') end,
        'checked', case when l.recorded_at >= now() - interval '1 hour' then l.recorded_at else now() end,
        'latency_ms', case when l.recorded_at >= now() - interval '1 hour' then (l.metric_value ->> 'latency_ms')::integer end,
        'uptime', u.pct,
        'source', case when l.recorded_at >= now() - interval '1 hour' then 'probe' else 'derived' end
      ) order by d.ord)
      from derived d
      left join latest l on l.key = d.key
      left join uptime u on u.key = d.key
    ),
    'incidents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'service', i.service, 'severity', i.severity, 'title', i.title,
        'started', i.started_at, 'resolved', i.resolved_at, 'updates', i.updates
      ) order by i.resolved_at is not null, i.started_at desc), '[]'::jsonb)
      from (select * from public.platform_incidents order by started_at desc limit 50) i
    ),
    'failed_webhooks', (
      select jsonb_agg(jsonb_build_object(
        'day', d,
        'selcom', (select count(*) from public.payments p where p.provider = 'SELCOM' and p.status = 'FAILED'
                     and app.dar_date(p.updated_at) = d),
        'azampay', (select count(*) from public.payments p where p.provider = 'AZAMPAY' and p.status = 'FAILED'
                      and app.dar_date(p.updated_at) = d),
        'whatsapp', (select count(*) from public.notifications n where n.channel = 'WHATSAPP' and n.status = 'failed'
                       and app.dar_date(coalesce(n.failed_at, n.created_at)) = d)
      ) order by d)
      from (select app.dar_today() - g as d from generate_series(6, 0, -1) g) days
    )
  );
end;
$$;

create or replace function app.ticket_json(r public.support_requests, p_assignee text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', r.id,
    'number', 'SUP-' || upper(substr(replace(r.id::text, '-', ''), 1, 6)),
    'company_id', r.tenant_id,
    'subject', r.subject,
    'body', r.body,
    'priority', lower(case r.priority when 'MEDIUM' then 'NORMAL' else r.priority end),
    'status', case r.status when 'OPEN' then 'open' when 'IN_PROGRESS' then 'pending' else 'resolved' end,
    'assignee', p_assignee,
    'assignee_id', r.assignee_id,
    'opened', r.created_at,
    -- SLA by priority: urgent 1h, high 4h, normal 24h, low 72h. Negative = breached.
    'sla_minutes', case when r.status in ('RESOLVED', 'CLOSED') then 0 else
      floor(extract(epoch from (r.created_at + case r.priority when 'URGENT' then interval '1 hour'
                                                                 when 'HIGH' then interval '4 hours'
                                                                 when 'MEDIUM' then interval '24 hours'
                                                                 else interval '72 hours' end) - now()) / 60)::integer end
  );
$$;

create or replace function public.control_support()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform('support.view');
  return jsonb_build_object(
    'tickets', (
      select coalesce(jsonb_agg(app.ticket_json(r, coalesce(a.name, a.email)) order by r.created_at desc), '[]'::jsonb)
      from public.support_requests r
      left join public.profiles a on a.id = r.assignee_id
    ),
    'sessions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'company_id', s.target_tenant_id, 'staff', coalesce(p.name, p.email),
        'ticket', coalesce(s.ticket, ''), 'mode', s.mode, 'ends_at', s.expires_at, 'reason', coalesce(s.reason, ''),
        'started_at', s.started_at
      ) order by s.started_at desc), '[]'::jsonb)
      from public.impersonation_sessions s
      left join public.profiles p on p.id = s.admin_user_id
      where s.ended_at is null and (s.expires_at is null or s.expires_at > now())
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', coalesce(p.name, p.email)) order by p.name), '[]'::jsonb)
      from public.profiles p where p.is_super_admin
    )
  );
end;
$$;

create or replace function app.audit_json(l public.audit_logs, p_staff text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', l.id::text,
    'at', l.created_at,
    'staff', coalesce(p_staff, l.actor_role, 'system'),
    'actor_role', l.actor_role,
    'action', l.action,
    'company_id', l.tenant_id,
    'reason', coalesce(l.diff ->> 'reason', ''),
    'before', coalesce(l.diff -> 'before', '{}'::jsonb),
    'after', coalesce(l.diff -> 'after', l.diff - 'reason' - 'before')
  );
$$;

create or replace function public.control_audit(p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform('audit.view');
  return jsonb_build_object(
    'entries', (
      select coalesce(jsonb_agg(x.j order by x.created_at desc, x.id desc), '[]'::jsonb)
      from (
        select app.audit_json(l, coalesce(p.name, p.email)) as j, l.created_at, l.id
        from public.audit_logs l
        left join public.profiles p on p.id = l.actor_user_id
        order by l.created_at desc, l.id desc
        limit least(greatest(p_limit, 1), 1000)
      ) x
    ),
    'staff', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.name, u.email, p.email, ''),
        'email', coalesce(u.email, p.email, ''),
        'role', coalesce(p.platform_role, 'OWNER'),
        'last_active', coalesce((select max(l.created_at) from public.audit_logs l where l.actor_user_id = p.id), p.updated_at),
        'mfa', false
      ) order by p.created_at), '[]'::jsonb)
      from public.profiles p
      left join auth.users u on u.id = p.id
      where p.is_super_admin
    ),
    'flags', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', f.key, 'description', f.description, 'enabled', f.enabled, 'rollout', f.rollout, 'plans', to_jsonb(f.plans)
      ) order by f.key), '[]'::jsonb)
      from public.feature_flags f
    ),
    'rate_cards', coalesce(app.setting_value('rate_cards'), '[]'::jsonb),
    'threshold_tzs', coalesce((app.setting_value('manual_payment_approval_threshold_tzs'))::integer, 500000)
  );
end;
$$;

create or replace function public.control_company(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_company jsonb;
  v_limit   numeric;
begin
  perform app.require_platform();
  select app.company_json(f) into v_company from app.company_facts() f where f.id = p_id;
  if v_company is null then
    return null;
  end if;
  select coalesce((p.limits ->> 'bookings_month')::numeric, 150) into v_limit
  from public.tenants t left join public.plans p on p.id = t.plan_id where t.id = p_id;

  return jsonb_build_object(
    'company', v_company,
    -- Weekly health (activity + recency components only; billing/setup are current-state).
    'health_trend', (
      select jsonb_agg(jsonb_build_object(
        'week', w,
        'score', least(100,
          least(40, round(40.0 * (select count(*) from public.bookings b where b.tenant_id = p_id and b.status <> 'EXPIRED'
                                   and b.created_at >= app.dar_start(w + 7) - interval '30 days' and b.created_at < app.dar_start(w + 7))
                     / greatest(1, coalesce(v_limit, 150) * 0.25)))
          + coalesce((select case
                          when max(b.updated_at) >= app.dar_start(w + 7) - interval '2 days' then 30
                          when max(b.updated_at) >= app.dar_start(w + 7) - interval '7 days' then 20
                          when max(b.updated_at) >= app.dar_start(w + 7) - interval '14 days' then 10
                          else 0 end
                      from public.bookings b where b.tenant_id = p_id and b.updated_at < app.dar_start(w + 7)), 0)
          + case when (v_company ->> 'lifecycle') in ('PAST_DUE', 'SUSPENDED', 'CHURNED') then 0 else 20 end
          + 10)
      ) order by w)
      from (select (date_trunc('week', app.dar_today()::timestamp)::date - 7 * g) as w from generate_series(5, 0, -1) g) weeks
    ),
    'gmv_trend', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'bookings', (select count(*) from public.bookings b where b.tenant_id = p_id and b.status <> 'EXPIRED'
                       and app.month_start(app.dar_date(b.created_at)) = m),
        'gmv', coalesce((select sum(b.total_tzs) from public.bookings b where b.tenant_id = p_id
                           and b.status not in ('CANCELLED', 'EXPIRED', 'QUOTE_REJECTED', 'NO_SHOW')
                           and app.month_start(app.dar_date(b.created_at)) = m), 0)
      ) order by m)
      from (select (app.month_start(app.dar_today()) - make_interval(months => g))::date as m from generate_series(5, 0, -1) g) months
    ),
    'invoices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'number', i.number, 'company_id', i.tenant_id, 'period', to_char(i.period, 'YYYY-MM'),
        'amount_tzs', i.amount_tzs, 'status', app.invoice_display_status(i.status, i.due_on),
        'issued', i.issued_on, 'due', i.due_on, 'method', i.method,
        'paid_tzs', coalesce((select sum(pp.amount_tzs) from public.platform_payments pp
                              where pp.invoice_id = i.id and pp.status = 'SUCCESS'), 0)
      ) order by i.period desc), '[]'::jsonb)
      from public.platform_invoices i where i.tenant_id = p_id
    ),
    'payments', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pp.id, 'invoice_id', pp.invoice_id, 'amount_tzs', pp.amount_tzs, 'method', pp.method,
        'status', pp.status, 'result', pp.result, 'reference', pp.reference, 'at', pp.occurred_at
      ) order by pp.occurred_at desc), '[]'::jsonb)
      from public.platform_payments pp where pp.tenant_id = p_id
    ),
    'credits', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'amount_tzs', c.amount_tzs, 'reason', c.reason, 'at', c.created_at
      ) order by c.created_at desc), '[]'::jsonb)
      from public.platform_credits c where c.tenant_id = p_id
    ),
    'integrations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', lower(k.kind),
        'status', case ti.status when 'ACTIVE' then 'connected' when 'ERROR' then 'error'
                                 when 'DISABLED' then 'disabled' else 'not_connected' end,
        'detail', case when ti.kind is null then null
                       else coalesce(ti.config ->> 'display_phone', ti.config ->> 'phone_number_id',
                                     ti.config ->> 'merchant_id', ti.config ->> 'sender_id') end,
        'updated_at', ti.updated_at
      ) order by k.ord), '[]'::jsonb)
      from (values ('WHATSAPP', 1), ('SELCOM', 2), ('AZAMPAY', 3), ('SMS', 4)) k(kind, ord)
      left join public.tenant_integrations ti on ti.tenant_id = p_id and ti.kind = k.kind
    ),
    'tickets', (
      select coalesce(jsonb_agg(app.ticket_json(r, coalesce(a.name, a.email)) order by r.created_at desc), '[]'::jsonb)
      from public.support_requests r left join public.profiles a on a.id = r.assignee_id
      where r.tenant_id = p_id
    ),
    'audit', (
      select coalesce(jsonb_agg(x.j order by x.created_at desc, x.id desc), '[]'::jsonb)
      from (
        select app.audit_json(l, coalesce(p.name, p.email)) as j, l.created_at, l.id
        from public.audit_logs l
        left join public.profiles p on p.id = l.actor_user_id
        where l.tenant_id = p_id
        order by l.created_at desc, l.id desc
        limit 200
      ) x
    )
  );
end;
$$;

/** Create-company step 2: is a ticket prefix (and slug) free? */
create or replace function public.control_check_prefix(p_prefix text, p_slug text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform('company.manage');
  return jsonb_build_object(
    'prefix_available', p_prefix ~ '^[A-Z]{2,5}$'
      and not exists (select 1 from public.tenants where ticket_prefix = p_prefix),
    'slug_available', p_slug is null or (p_slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'
      and not exists (select 1 from public.tenants where slug = p_slug))
  );
end;
$$;

-- ===========================================================================
-- WRITE functions (each audited with the reason)
-- ===========================================================================

create or replace function public.control_create_company(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id       uuid;
  v_owner    uuid;
  v_phone    text := p ->> 'owner_phone';
  v_trial    integer := coalesce((p ->> 'trial_days')::integer, 14);
  v_plan     text := p ->> 'plan_id';
begin
  perform app.require_platform_write('company.manage');
  if not exists (select 1 from public.plans where id = v_plan) then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  if v_trial < 0 or v_trial > 90 then
    raise exception 'invalid_trial' using errcode = '22023';
  end if;
  if v_phone is null or v_phone !~ '^\+255[1-9]\d{8}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenants where ticket_prefix = p ->> 'ticket_prefix') then
    raise exception 'prefix_taken' using errcode = '23505';
  end if;
  if exists (select 1 from public.tenants where slug = p ->> 'slug') then
    raise exception 'slug_taken' using errcode = '23505';
  end if;

  insert into public.tenants (slug, name, phone_e164, city, ticket_prefix, plan_id, status, trial_ends_at,
                              account_manager_id, settings)
  values (
    p ->> 'slug', p ->> 'name', coalesce(nullif(p ->> 'business_phone', ''), v_phone), nullif(p ->> 'city', ''),
    p ->> 'ticket_prefix', v_plan,
    case when v_trial > 0 then 'TRIAL' else 'ACTIVE' end::public.tenant_status,
    case when v_trial > 0 then app.dar_start(app.dar_today() + v_trial + 1) end,
    nullif(p ->> 'account_manager_id', '')::uuid,
    jsonb_build_object('services_template', coalesce(p ->> 'template', 'blank'), 'default_locale', 'sw',
                       'languages', jsonb_build_array('sw', 'en'))
  )
  returning id into v_id;

  -- Owner login: reuse the profile for this phone, or create the phone account (OTP sign-in).
  select id into v_owner from public.profiles where phone_e164 = v_phone;
  if v_owner is null then
    v_owner := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            confirmation_token, recovery_token, email_change, email_change_token_new,
                            email_change_token_current, phone_change, phone_change_token, reauthentication_token,
                            created_at, updated_at)
    values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', substr(v_phone, 2), now(),
            '{"provider":"phone","providers":["phone"]}',
            jsonb_build_object('name', p ->> 'owner_name', 'locale', 'sw'),
            '', '', '', '', '', '', '', '', now(), now());
    update public.profiles set name = coalesce(name, nullif(p ->> 'owner_name', '')) where id = v_owner;
  end if;
  if exists (select 1 from public.memberships where user_id = v_owner and active) then
    raise exception 'owner_has_company' using errcode = '23505';
  end if;
  insert into public.memberships (tenant_id, user_id, role, active) values (v_id, v_owner, 'OWNER', true);

  perform app.write_audit(v_id, 'company.created', 'tenant', v_id,
    jsonb_build_object('reason', 'Created from the control center',
                       'after', jsonb_build_object('plan', v_plan, 'trial_days', v_trial, 'owner_phone', v_phone,
                                                   'template', p ->> 'template')),
    'super_admin');
  return v_id;
end;
$$;

create or replace function public.control_change_plan(p_tenant uuid, p_plan text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old text;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('company.manage');
  if not exists (select 1 from public.plans where id = p_plan) then
    raise exception 'invalid_plan' using errcode = '22023';
  end if;
  select plan_id into v_old from public.tenants where id = p_tenant for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0002'; end if;
  update public.tenants set plan_id = p_plan where id = p_tenant;
  perform app.write_audit(p_tenant, 'company.plan_changed', 'tenant', p_tenant,
    jsonb_build_object('reason', v_reason, 'before', jsonb_build_object('plan', v_old), 'after', jsonb_build_object('plan', p_plan)),
    'super_admin');
end;
$$;

create or replace function public.control_extend_trial(p_tenant uuid, p_days integer, p_reason text)
returns date
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_t public.tenants;
  v_new timestamptz;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('company.manage');
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception 'invalid_days' using errcode = '22023';
  end if;
  select * into v_t from public.tenants where id = p_tenant for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0002'; end if;
  if v_t.status <> 'TRIAL' then raise exception 'not_in_trial' using errcode = '22023'; end if;
  v_new := greatest(coalesce(v_t.trial_ends_at, now()), app.dar_start(app.dar_today() + 1)) + make_interval(days => p_days);
  update public.tenants set trial_ends_at = v_new where id = p_tenant;
  perform app.write_audit(p_tenant, 'company.trial_extended', 'tenant', p_tenant,
    jsonb_build_object('reason', v_reason,
                       'before', jsonb_build_object('trial_ends', app.dar_date(v_t.trial_ends_at)),
                       'after', jsonb_build_object('trial_ends', app.dar_date(v_new))),
    'super_admin');
  return app.dar_date(v_new);
end;
$$;

/** Suspend, reactivate, mark past due, or end a trial early. */
create or replace function public.control_set_status(p_tenant uuid, p_status public.tenant_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.tenant_status;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write(case when p_status = 'SUSPENDED' then 'company.suspend' else 'company.manage' end);
  select status into v_old from public.tenants where id = p_tenant for update;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0002'; end if;
  update public.tenants
     set status = p_status,
         churned_at = case when p_status = 'SUSPENDED' then churned_at else null end,
         churn_reason = case when p_status = 'SUSPENDED' then churn_reason else null end
   where id = p_tenant;
  perform app.write_audit(p_tenant,
    case p_status when 'SUSPENDED' then 'company.suspended' when 'ACTIVE' then 'company.reactivated'
                  else 'company.status_changed' end,
    'tenant', p_tenant,
    jsonb_build_object('reason', v_reason, 'before', jsonb_build_object('lifecycle', v_old),
                       'after', jsonb_build_object('lifecycle', p_status)),
    'super_admin');
end;
$$;

create or replace function public.control_mark_churned(p_tenant uuid, p_churn_reason text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('company.suspend');
  update public.tenants set status = 'SUSPENDED', churned_at = now(), churn_reason = coalesce(p_churn_reason, 'other')
  where id = p_tenant;
  if not found then raise exception 'tenant_not_found' using errcode = 'P0002'; end if;
  perform app.write_audit(p_tenant, 'company.churned', 'tenant', p_tenant,
    jsonb_build_object('reason', v_reason, 'after', jsonb_build_object('lifecycle', 'CHURNED', 'churn_reason', p_churn_reason)),
    'super_admin');
end;
$$;

create or replace function public.control_set_account_manager(p_tenant uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old uuid;
begin
  perform app.require_platform_write('company.manage');
  if p_user is not null and not exists (select 1 from public.profiles where id = p_user and is_super_admin) then
    raise exception 'not_platform_staff' using errcode = '22023';
  end if;
  select account_manager_id into v_old from public.tenants where id = p_tenant for update;
  update public.tenants set account_manager_id = p_user where id = p_tenant;
  perform app.write_audit(p_tenant, 'company.account_manager_changed', 'tenant', p_tenant,
    jsonb_build_object('reason', 'Account manager assignment', 'before', jsonb_build_object('account_manager_id', v_old),
                       'after', jsonb_build_object('account_manager_id', p_user)),
    'super_admin');
end;
$$;

create or replace function public.control_apply_credit(p_tenant uuid, p_amount integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_inv public.platform_invoices;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('billing.manage');
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  -- Settle the oldest unpaid invoice the credit fully covers.
  select * into v_inv from public.platform_invoices
  where tenant_id = p_tenant and status in ('OPEN', 'FAILED') and amount_tzs <= p_amount
  order by due_on limit 1 for update;
  insert into public.platform_credits (tenant_id, invoice_id, amount_tzs, reason, created_by)
  values (p_tenant, v_inv.id, p_amount, v_reason, app.current_user_id())
  returning id into v_id;
  if v_inv.id is not null then
    update public.platform_invoices set status = 'CREDITED', next_retry_at = null where id = v_inv.id;
  end if;
  perform app.write_audit(p_tenant, 'billing.credit_applied', 'platform_credit', v_id,
    jsonb_build_object('reason', v_reason, 'after', jsonb_build_object('credit_tzs', p_amount, 'invoice', v_inv.number)),
    'super_admin');
  return v_id;
end;
$$;

/** After money lands: mark the invoice paid when covered, and lift PAST_DUE when nothing is owed. */
create or replace function app.settle_after_payment(p_tenant uuid, p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  if p_invoice is not null then
    update public.platform_invoices i
       set status = 'PAID', paid_at = now(), next_retry_at = null
     where i.id = p_invoice and i.status in ('OPEN', 'FAILED')
       and (select coalesce(sum(amount_tzs), 0) from public.platform_payments
            where invoice_id = p_invoice and status = 'SUCCESS') >= i.amount_tzs;
  end if;
  if not exists (select 1 from public.platform_invoices where tenant_id = p_tenant and status in ('OPEN', 'FAILED')
                 and due_on < app.dar_today()) then
    update public.tenants set status = 'ACTIVE' where id = p_tenant and status = 'PAST_DUE';
  end if;
end;
$$;

create or replace function public.control_record_payment(
  p_tenant uuid, p_invoice uuid, p_amount integer, p_method text, p_reference text, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_threshold integer := coalesce((app.setting_value('manual_payment_approval_threshold_tzs'))::integer, 500000);
  v_status text;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('billing.manage');
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if p_invoice is not null and not exists (select 1 from public.platform_invoices where id = p_invoice and tenant_id = p_tenant) then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  v_status := case when p_amount > v_threshold then 'PENDING_APPROVAL' else 'SUCCESS' end;
  insert into public.platform_payments (tenant_id, invoice_id, amount_tzs, method, status, reference, reason, recorded_by)
  values (p_tenant, p_invoice, p_amount, p_method, v_status, nullif(btrim(p_reference), ''), v_reason, app.current_user_id())
  returning id into v_id;
  if v_status = 'SUCCESS' then
    perform app.settle_after_payment(p_tenant, p_invoice);
  end if;
  perform app.write_audit(p_tenant, 'billing.manual_payment_recorded', 'platform_payment', v_id,
    jsonb_build_object('reason', v_reason, 'after', jsonb_build_object('amount_tzs', p_amount, 'method', p_method,
                                                                         'status', v_status, 'reference', p_reference)),
    'super_admin');
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

/** Second approval for a large manual payment; the approver must not be the recorder. */
create or replace function public.control_review_payment(p_payment uuid, p_approve boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_p public.platform_payments;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('billing.manage');
  select * into v_p from public.platform_payments where id = p_payment for update;
  if not found or v_p.status <> 'PENDING_APPROVAL' then
    raise exception 'not_pending' using errcode = '22023';
  end if;
  if v_p.recorded_by = app.current_user_id() then
    raise exception 'second_approver_required' using errcode = '42501';
  end if;
  update public.platform_payments
     set status = case when p_approve then 'SUCCESS' else 'REJECTED' end, approved_by = app.current_user_id()
   where id = p_payment;
  if p_approve then
    perform app.settle_after_payment(v_p.tenant_id, v_p.invoice_id);
  end if;
  perform app.write_audit(v_p.tenant_id, case when p_approve then 'billing.payment_approved' else 'billing.payment_rejected' end,
    'platform_payment', p_payment, jsonb_build_object('reason', v_reason, 'after', jsonb_build_object('amount_tzs', v_p.amount_tzs)),
    'super_admin');
end;
$$;

/** Issue this month's subscription invoices for paying companies that do not have one yet. */
create or replace function public.control_issue_invoices(p_period date default null)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_period date := app.month_start(coalesce(p_period, app.dar_today()));
  v_due integer := coalesce((app.setting_value('invoice_due_days'))::integer, 7);
  v_n integer;
begin
  perform app.require_platform_write('billing.manage');
  with ins as (
    insert into public.platform_invoices (number, tenant_id, period, amount_tzs, status, issued_on, due_on)
    select 'S360-' || to_char(v_period, 'YYYY') || '-' || lpad(nextval('public.platform_invoice_number_seq')::text, 4, '0'),
           t.id, v_period, p.price_tzs, 'OPEN', app.dar_today(), app.dar_today() + v_due
    from public.tenants t
    join public.plans p on p.id = t.plan_id
    where t.status in ('ACTIVE', 'PAST_DUE') and t.deleted_at is null and t.churned_at is null and p.price_tzs > 0
      and not exists (select 1 from public.platform_invoices i where i.tenant_id = t.id and i.period = v_period)
    returning tenant_id
  )
  select count(*) into v_n from ins;
  perform app.write_audit(null, 'billing.invoices_issued', 'platform_invoice', null,
    jsonb_build_object('reason', 'Monthly subscription invoices', 'after', jsonb_build_object('period', v_period, 'count', v_n)),
    'super_admin');
  return v_n;
end;
$$;

/** Queue a renewal retry. A payment worker picks up invoices whose next_retry_at has passed. */
create or replace function public.control_retry_renewal(p_invoice uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_inv public.platform_invoices;
begin
  perform app.require_platform_write('billing.manage');
  update public.platform_invoices set next_retry_at = now()
  where id = p_invoice and status in ('OPEN', 'FAILED')
  returning * into v_inv;
  if v_inv.id is null then raise exception 'invoice_not_retryable' using errcode = '22023'; end if;
  perform app.write_audit(v_inv.tenant_id, 'billing.retry_queued', 'platform_invoice', p_invoice,
    jsonb_build_object('reason', 'Manual retry', 'after', jsonb_build_object('invoice', v_inv.number)), 'super_admin');
end;
$$;

create or replace function public.control_void_invoice(p_invoice uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_inv public.platform_invoices;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('billing.manage');
  update public.platform_invoices set status = 'VOID', next_retry_at = null
  where id = p_invoice and status in ('OPEN', 'FAILED')
  returning * into v_inv;
  if v_inv.id is null then raise exception 'invoice_not_voidable' using errcode = '22023'; end if;
  perform app.write_audit(v_inv.tenant_id, 'billing.invoice_voided', 'platform_invoice', p_invoice,
    jsonb_build_object('reason', v_reason, 'after', jsonb_build_object('invoice', v_inv.number)), 'super_admin');
end;
$$;

create or replace function public.control_set_cost(p_month date, p_category text, p_amount integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_month date := app.month_start(p_month);
  v_old integer;
begin
  perform app.require_platform_write('profit.manage');
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  select amount_tzs into v_old from public.platform_costs where month = v_month and category = p_category;
  insert into public.platform_costs (month, category, amount_tzs, note, updated_by)
  values (v_month, p_category, p_amount, p_note, app.current_user_id())
  on conflict (month, category) do update
    set amount_tzs = excluded.amount_tzs, note = excluded.note, updated_by = excluded.updated_by, updated_at = now();
  perform app.write_audit(null, 'profit.cost_updated', 'platform_cost', null,
    jsonb_build_object('reason', coalesce(nullif(btrim(p_note), ''), 'Cost entry'),
                       'before', jsonb_build_object('month', v_month, 'category', p_category, 'amount_tzs', v_old),
                       'after', jsonb_build_object('month', v_month, 'category', p_category, 'amount_tzs', p_amount)),
    'super_admin');
end;
$$;

create or replace function public.control_set_flag(
  p_key text, p_description text, p_enabled boolean, p_rollout integer, p_plans text[], p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old jsonb;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('flags.manage');
  select to_jsonb(f) - 'updated_by' - 'updated_at' into v_old from public.feature_flags f where key = p_key;
  insert into public.feature_flags (key, description, enabled, rollout, plans, updated_by)
  values (p_key, coalesce(p_description, ''), p_enabled, p_rollout, coalesce(p_plans, '{}'), app.current_user_id())
  on conflict (key) do update
    set description = coalesce(nullif(excluded.description, ''), public.feature_flags.description),
        enabled = excluded.enabled, rollout = excluded.rollout, plans = excluded.plans,
        updated_by = excluded.updated_by, updated_at = now();
  perform app.write_audit(null, 'feature_flag.updated', 'feature_flag', null,
    jsonb_build_object('reason', v_reason, 'before', coalesce(v_old, '{}'::jsonb),
                       'after', jsonb_build_object('key', p_key, 'enabled', p_enabled, 'rollout', p_rollout, 'plans', p_plans)),
    'super_admin');
end;
$$;

/** Plan price and limits. Limits: {bookings, staff, whatsapp, sms, branches}; null = unlimited. */
create or replace function public.control_update_plan(p_plan text, p_price integer, p_limits jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.plans;
  v_limits jsonb;
  v_key text;
  v_db_key text;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('settings.manage');
  select * into v_old from public.plans where id = p_plan for update;
  if not found then raise exception 'invalid_plan' using errcode = '22023'; end if;
  -- Only the keys sent change; a JSON null sets that limit back to unlimited.
  v_limits := v_old.limits;
  for v_key, v_db_key in
    select * from (values ('bookings', 'bookings_month'), ('staff', 'staff'), ('whatsapp', 'whatsapp_month'),
                          ('sms', 'sms_month'), ('branches', 'branches')) m(k, db)
  loop
    if coalesce(p_limits, '{}'::jsonb) ? v_key then
      v_limits := jsonb_set(v_limits, array[v_db_key], p_limits -> v_key, true);
    end if;
  end loop;
  update public.plans set price_tzs = coalesce(p_price, price_tzs), limits = v_limits where id = p_plan;
  -- A price change moves MRR for every company on the plan.
  if p_price is not null and p_price <> v_old.price_tzs then
    insert into public.tenant_subscription_events (tenant_id, plan_id, status, churned, mrr_tzs)
    select t.id, t.plan_id, t.status, t.churned_at is not null or t.deleted_at is not null,
           app.tenant_mrr(t.plan_id, t.status, t.churned_at is not null or t.deleted_at is not null)
    from public.tenants t where t.plan_id = p_plan;
  end if;
  perform app.write_audit(null, 'plan.updated', 'plan', null,
    jsonb_build_object('reason', v_reason,
                       'before', jsonb_build_object(p_plan, jsonb_build_object('price_tzs', v_old.price_tzs, 'limits', v_old.limits)),
                       'after', jsonb_build_object(p_plan, jsonb_build_object('price_tzs', coalesce(p_price, v_old.price_tzs), 'limits', v_limits))),
    'super_admin');
end;
$$;

create or replace function public.control_set_setting(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old jsonb;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('settings.manage');
  if p_key not in ('manual_payment_approval_threshold_tzs', 'grace_days', 'invoice_due_days', 'rate_cards') then
    raise exception 'unknown_setting' using errcode = '22023';
  end if;
  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value, updated_by) values (p_key, p_value, app.current_user_id())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
  perform app.write_audit(null, 'settings.updated', 'platform_setting', null,
    jsonb_build_object('reason', v_reason, 'before', jsonb_build_object(p_key, v_old), 'after', jsonb_build_object(p_key, p_value)),
    'super_admin');
end;
$$;

create or replace function public.control_set_staff_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old text;
begin
  perform app.require_platform_write('settings.manage');
  if p_role not in ('OWNER', 'FINANCE', 'SUPPORT', 'ENGINEER', 'ANALYST') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_user = app.current_user_id() then
    raise exception 'cannot_edit_self' using errcode = '42501';
  end if;
  select platform_role into v_old from public.profiles where id = p_user and is_super_admin;
  if not found then raise exception 'not_platform_staff' using errcode = 'P0002'; end if;
  update public.profiles set platform_role = p_role where id = p_user;
  perform app.write_audit(null, 'staff.role_changed', 'profile', p_user,
    jsonb_build_object('reason', 'Platform role change', 'before', jsonb_build_object('role', v_old),
                       'after', jsonb_build_object('role', p_role)),
    'super_admin');
end;
$$;

create or replace function public.control_start_session(
  p_tenant uuid, p_ticket text, p_mode text, p_minutes integer, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_until timestamptz;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('support.session');
  if p_mode not in ('read_only', 'write') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 240 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  -- One open session per staff member.
  update public.impersonation_sessions set ended_at = now()
  where admin_user_id = app.current_user_id() and ended_at is null;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.impersonation_sessions (admin_user_id, target_tenant_id, target_role, reason, mode, ticket, expires_at)
  values (app.current_user_id(), p_tenant, 'OWNER', v_reason, p_mode, nullif(btrim(p_ticket), ''), v_until)
  returning id into v_id;
  perform app.write_audit(p_tenant, 'support_session.start', 'impersonation_session', v_id,
    jsonb_build_object('reason', v_reason, 'before', jsonb_build_object('session', null),
                       'after', jsonb_build_object('session', v_id, 'mode', p_mode, 'max_minutes', p_minutes, 'ticket', p_ticket)),
    'super_admin');
  return jsonb_build_object('id', v_id, 'ends_at', v_until);
end;
$$;

create or replace function public.control_end_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant uuid;
begin
  perform app.require_platform_write('support.session');
  update public.impersonation_sessions set ended_at = now()
  where id = p_session and ended_at is null
  returning target_tenant_id into v_tenant;
  if v_tenant is not null then
    perform app.write_audit(v_tenant, 'support_session.end', 'impersonation_session', p_session,
      jsonb_build_object('reason', 'Session ended'), 'super_admin');
  end if;
end;
$$;

create or replace function public.control_update_ticket(p_ticket uuid, p_status text, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_old public.support_requests;
  v_status text := case p_status when 'open' then 'OPEN' when 'pending' then 'IN_PROGRESS'
                                 when 'resolved' then 'RESOLVED' else null end;
begin
  perform app.require_platform_write('support.view');
  select * into v_old from public.support_requests where id = p_ticket for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  update public.support_requests
     set status = coalesce(v_status, status),
         assignee_id = p_assignee,
         resolved_at = case when coalesce(v_status, status) in ('RESOLVED', 'CLOSED') then coalesce(resolved_at, now()) end
   where id = p_ticket;
  perform app.write_audit(v_old.tenant_id, 'support.ticket_updated', 'support_request', p_ticket,
    jsonb_build_object('reason', 'Ticket triage',
                       'before', jsonb_build_object('status', v_old.status, 'assignee_id', v_old.assignee_id),
                       'after', jsonb_build_object('status', coalesce(v_status, v_old.status), 'assignee_id', p_assignee)),
    'super_admin');
end;
$$;

create or replace function public.control_report_incident(p_service text, p_severity text, p_title text, p_update text)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
begin
  perform app.require_platform_write('flags.manage');
  insert into public.platform_incidents (service, severity, title, updates, created_by)
  values (p_service, p_severity, p_title,
          case when nullif(btrim(p_update), '') is null then '[]'::jsonb
               else jsonb_build_array(jsonb_build_object('at', now(), 'text', btrim(p_update))) end,
          app.current_user_id())
  returning id into v_id;
  perform app.write_audit(null, 'incident.opened', 'platform_incident', v_id,
    jsonb_build_object('reason', p_title, 'after', jsonb_build_object('service', p_service, 'severity', p_severity)), 'super_admin');
  return v_id;
end;
$$;

create or replace function public.control_update_incident(p_incident uuid, p_update text, p_resolve boolean)
returns void
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin
  perform app.require_platform_write('flags.manage');
  update public.platform_incidents
     set updates = updates || case when nullif(btrim(p_update), '') is null then '[]'::jsonb
                                   else jsonb_build_array(jsonb_build_object('at', now(), 'text', btrim(p_update))) end,
         resolved_at = case when p_resolve then coalesce(resolved_at, now()) else resolved_at end
   where id = p_incident;
  if not found then raise exception 'incident_not_found' using errcode = 'P0002'; end if;
  perform app.write_audit(null, case when p_resolve then 'incident.resolved' else 'incident.updated' end,
    'platform_incident', p_incident, jsonb_build_object('reason', coalesce(nullif(btrim(p_update), ''), 'Incident update')),
    'super_admin');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: control_* callable by signed-in users (each checks the platform role
-- itself); helpers stay private.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'control\_%'
  loop
    execute format('revoke all on function %I.%I(%s) from public, anon', r.nspname, r.proname, r.args);
    execute format('grant execute on function %I.%I(%s) to authenticated', r.nspname, r.proname, r.args);
  end loop;
end
$$;

revoke all on function app.company_facts() from public, anon, authenticated;

revoke all on function app.attention_items() from public, anon, authenticated;

revoke all on function app.billed_collected(integer) from public, anon, authenticated;

revoke all on function app.net_profit(date) from public, anon, authenticated;

revoke all on function app.settle_after_payment(uuid, uuid) from public, anon, authenticated;

revoke all on function app.log_subscription_event() from public, anon, authenticated;

revoke all on function app.setting_value(text) from public, anon, authenticated;
