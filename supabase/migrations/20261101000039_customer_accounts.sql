-- 0039 · client accounts: phone + password per business
--
-- Clients used to prove their phone with an SMS code before booking or tracking. Until the
-- Briq SMS sender ID is approved no code can be sent, so a client instead creates an account
-- with the business (phone, password, optional email) and signs in with phone + password.
-- Accounts are per tenant, like public.customers: a client of two businesses has two.
--
-- The password hash lives in its own table, closed to every client role (RLS on, no grants),
-- so staff reading customers never see it. Only the customer_auth Edge Function (service
-- role) reads or writes it, through the two functions below.
--
-- Without SMS a number is not proven to belong to whoever registers it: the first person to
-- set a password on a phone owns that client record at that business. Once SMS works, the
-- signup can require a code again.

create table public.customer_credentials (
  customer_id   uuid primary key,
  tenant_id     uuid not null references public.tenants(id),
  password_hash text not null check (password_hash like 'pbkdf2$%'),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (customer_id, tenant_id) references public.customers(id, tenant_id) on delete cascade
);

create trigger customer_credentials_set_updated_at
  before update on public.customer_credentials
  for each row execute function app.set_updated_at();

alter table public.customer_credentials enable row level security;
revoke all on public.customer_credentials from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- customer_register: create the client (or adopt an existing client record without a
-- password, e.g. one the office added) and set the password, atomically. Raises
-- already_registered when the phone already has a password at this business.
-- ---------------------------------------------------------------------------
create or replace function public.customer_register(
  p_tenant_id     uuid,
  p_phone         text,
  p_name          text,
  p_email         text,
  p_locale        text,
  p_password_hash text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid;
  v_name     text := nullif(btrim(coalesce(p_name, '')), '');
  v_email    text := lower(nullif(btrim(coalesce(p_email, '')), ''));
begin
  select c.id into v_customer
  from public.customers c
  where c.tenant_id = p_tenant_id and c.phone_e164 = p_phone and c.deleted_at is null
  for update;

  if v_customer is null then
    if v_name is null then
      raise exception 'name_required' using errcode = '23502';
    end if;
    insert into public.customers (tenant_id, phone_e164, name, email, locale, first_source)
    values (p_tenant_id, p_phone, v_name, v_email,
            case when p_locale in ('sw', 'en') then p_locale else 'sw' end, 'website')
    returning id into v_customer;
  else
    -- Fill gaps only; never overwrite what the office recorded.
    update public.customers
    set email = coalesce(email, v_email)
    where id = v_customer;
  end if;

  insert into public.customer_credentials (customer_id, tenant_id, password_hash)
  values (v_customer, p_tenant_id, p_password_hash)
  on conflict (customer_id) do nothing;
  if not found then
    raise exception 'already_registered' using errcode = '23505';
  end if;

  return v_customer;
end;
$$;

-- ---------------------------------------------------------------------------
-- customer_password_hash: the stored hash for a phone at a business (null when there is
-- no account), for the sign-in check done in the Edge Function.
-- ---------------------------------------------------------------------------
create or replace function public.customer_password_hash(p_tenant_id uuid, p_phone text)
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select cc.password_hash
  from public.customer_credentials cc
  join public.customers c on c.id = cc.customer_id and c.tenant_id = cc.tenant_id
  where cc.tenant_id = p_tenant_id and c.phone_e164 = p_phone and c.deleted_at is null;
$$;

revoke all on function public.customer_register(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_password_hash(uuid, text) from public, anon, authenticated;
grant execute on function public.customer_register(uuid, text, text, text, text, text) to service_role;
grant execute on function public.customer_password_hash(uuid, text) to service_role;
