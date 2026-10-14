// Catalog data access through the RLS-governed client. tenant_id is never sent: the
// column defaults to the JWT claim and RLS rejects anything else.
import { asError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  AddonInput,
  AddonRow,
  CategoryInput,
  CategoryRow,
  ServiceInput,
  ServiceRow,
  ZoneInput,
  ZoneRow,
} from './types';

const SERVICE_COLUMNS =
  'id, category_id, name_sw, name_en, description_sw, description_en, pricing_type, pricing_rule, duration_rule, crew_size, recurrence_days, sort, active, deleted_at, updated_at';
const ADDON_COLUMNS = 'id, service_id, name_sw, name_en, price_tzs, per_unit, sort, active';
const ZONE_COLUMNS = 'id, name, areas, polygon, max_km, travel_fee_tzs, serviceable, sort, active';

interface Result {
  data: unknown;
  error: unknown;
}

/** Throw on PostgREST errors and assert the row shape the caller selected. */
function unwrap<T>(res: Result): T {
  if (res.error) throw asError(res.error);
  return res.data as T;
}

export async function listServices(): Promise<ServiceRow[]> {
  return unwrap<ServiceRow[]>(
    await supabase
      .from('services')
      .select(SERVICE_COLUMNS)
      .is('deleted_at', null)
      .order('sort')
      .order('name_en'),
  );
}

export async function getService(id: string): Promise<ServiceRow> {
  return unwrap<ServiceRow>(
    await supabase.from('services').select(SERVICE_COLUMNS).eq('id', id).is('deleted_at', null).single(),
  );
}

export async function saveService(input: ServiceInput): Promise<ServiceRow> {
  const { id, ...fields } = input;
  const query = id
    ? supabase.from('services').update(fields).eq('id', id)
    : supabase.from('services').insert(fields);
  return unwrap<ServiceRow>(await query.select(SERVICE_COLUMNS).single());
}

/** Soft delete: booked services must keep resolving on old tickets. */
export async function archiveService(id: string): Promise<void> {
  unwrap<unknown>(
    await supabase
      .from('services')
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq('id', id)
      .select('id'),
  );
}

export async function listCategories(): Promise<CategoryRow[]> {
  return unwrap<CategoryRow[]>(
    await supabase
      .from('service_categories')
      .select('id, name_sw, name_en, sort')
      .order('sort')
      .order('name_en'),
  );
}

export async function saveCategory(input: CategoryInput): Promise<CategoryRow> {
  const { id, ...fields } = input;
  const query = id
    ? supabase.from('service_categories').update(fields).eq('id', id)
    : supabase.from('service_categories').insert(fields);
  return unwrap<CategoryRow>(await query.select('id, name_sw, name_en, sort').single());
}

export async function listAddons(serviceId?: string): Promise<AddonRow[]> {
  let q = supabase.from('service_addons').select(ADDON_COLUMNS).order('sort');
  if (serviceId) q = q.or(`service_id.eq.${serviceId},service_id.is.null`);
  return unwrap<AddonRow[]>(await q);
}

/** Make the add-ons attached to a service exactly `addons`: update kept ids, insert new, delete removed. */
export async function replaceServiceAddons(serviceId: string, addons: AddonInput[]): Promise<AddonRow[]> {
  const existing = unwrap<{ id: string }[]>(
    await supabase.from('service_addons').select('id').eq('service_id', serviceId),
  );
  const keep = new Set(addons.map((a) => a.id).filter((x): x is string => !!x));
  const remove = existing.map((e) => e.id).filter((id) => !keep.has(id));
  if (remove.length)
    unwrap<unknown>(await supabase.from('service_addons').delete().in('id', remove).select('id'));
  const rows: AddonRow[] = [];
  for (const [i, addon] of addons.entries()) {
    const { id, ...fields } = addon;
    const payload = { ...fields, sort: i, service_id: serviceId };
    const query = id
      ? supabase.from('service_addons').update(payload).eq('id', id)
      : supabase.from('service_addons').insert(payload);
    rows.push(unwrap<AddonRow>(await query.select(ADDON_COLUMNS).single()));
  }
  return rows;
}

export async function listZones(): Promise<ZoneRow[]> {
  const rows = unwrap<ZoneRow[]>(
    await supabase.from('service_zones').select(ZONE_COLUMNS).order('sort').order('name'),
  );
  return rows.map((z) => ({ ...z, max_km: z.max_km == null ? null : Number(z.max_km) }));
}

export async function saveZone(input: ZoneInput): Promise<ZoneRow> {
  const { id, ...fields } = input;
  const query = id
    ? supabase.from('service_zones').update(fields).eq('id', id)
    : supabase.from('service_zones').insert(fields);
  return unwrap<ZoneRow>(await query.select(ZONE_COLUMNS).single());
}

export async function deleteZone(id: string): Promise<void> {
  unwrap<unknown>(await supabase.from('service_zones').delete().eq('id', id).select('id'));
}
