-- 0028 · staff self-provisioning
-- New employees sign in on the cleaner app with their own phone (OTP). Creating the
-- auth user must also create the matching public.profiles row so the office can find
-- them by phone under Settings → Staff and assign a role. Membership (and therefore any
-- access) is still granted only by the office; a profile alone reads nothing.

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text;
  v_meta  jsonb;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);

  -- GoTrue stores phones without the leading '+' (e.g. 255754000001); profiles keep E.164.
  v_phone := nullif(new.phone, '');
  if v_phone is not null and v_phone !~ '^\+' then
    v_phone := '+' || regexp_replace(v_phone, '[^0-9]', '', 'g');
  end if;

  insert into public.profiles (id, phone_e164, name, locale)
  values (
    new.id,
    case when v_phone ~ '^\+255[1-9]\d{8}$' then v_phone else null end,
    nullif(coalesce(v_meta ->> 'name', v_meta ->> 'full_name'), ''),
    case when coalesce(v_meta ->> 'locale', 'sw') in ('sw', 'en') then coalesce(v_meta ->> 'locale', 'sw') else 'sw' end
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
