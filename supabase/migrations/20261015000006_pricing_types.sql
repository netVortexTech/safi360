-- 0006 · pricing types + tenant base location
-- The brief lists eight pricing types; 0002 shipped six. New enum values cannot be used
-- in the same transaction that adds them, so this file only alters the type; 0007 uses it.
-- Order after this file: PER_UNIT, PER_SEAT, PER_VARIANT, PER_AREA, PER_ROOM, FLAT,
-- INSPECTION_REQUIRED, CUSTOM_QUOTE (mirrored in _shared/enums.ts).

alter type public.pricing_type add value if not exists 'PER_SEAT' after 'PER_UNIT';
alter type public.pricing_type add value if not exists 'INSPECTION_REQUIRED' before 'CUSTOM_QUOTE';

-- Distance-band zones measure from the tenant's base. Plain coordinates for now: the
-- db test suite runs on PGlite, which cannot load PostGIS. A PostGIS geography column
-- can be added by a later migration without touching these.
alter table public.tenants
  add column base_lat double precision check (base_lat between -90 and 90),
  add column base_lng double precision check (base_lng between -180 and 180),
  add constraint tenants_base_both_or_none
    check ((base_lat is null) = (base_lng is null));
