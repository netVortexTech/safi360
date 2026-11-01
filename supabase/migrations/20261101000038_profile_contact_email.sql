-- 0038 · optional contact email on self-serve accounts
--
-- Staff sign up with phone + password and may add an email (signUp options.data.contact_email).
-- It is a contact address only: never verified and never used to sign in. handle_new_user()
-- (0028) copies it into profiles.email when it is well formed and not already taken, because
-- profiles.email is unique and a clash must not stop the account (and its profile) existing.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_meta  jsonb;
  v_email text;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- GoTrue stores phones without the leading '+' (e.g. 255754000001); profiles keep E.164.
  v_phone := nullif(new.phone, '');
  if v_phone is not null and v_phone !~ '^\+' then
    v_phone := '+' || regexp_replace(v_phone, '[^0-9]', '', 'g');
  end if;

  v_email := lower(nullif(btrim(coalesce(v_meta ->> 'contact_email', '')), ''));
  if v_email is not null
     and (length(v_email) > 254
          or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
          or exists (select 1 from public.profiles p where lower(p.email) = v_email)) then
    v_email := null;
  end if;

  insert into public.profiles (id, phone_e164, name, locale, email)
  values (
    new.id,
    case when v_phone ~ '^\+255[1-9]\d{8}$' then v_phone else null end,
    nullif(coalesce(v_meta ->> 'name', v_meta ->> 'full_name'), ''),
    case when coalesce(v_meta ->> 'locale', 'sw') in ('sw', 'en') then coalesce(v_meta ->> 'locale', 'sw') else 'sw' end,
    v_email
  )
  on conflict do nothing;

  return new;
end;
$$;
