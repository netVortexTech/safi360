import type { PayType } from '@shared/enums';
import { asError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface StaffRow {
  id: string;
  user_id: string | null;
  display_name: string;
  phone_e164: string | null;
  skills: string[];
  home_zone_id: string | null;
  is_team_lead: boolean;
  pay_type: PayType | null;
  pay_rate_tzs: number | null;
  active: boolean;
}

export interface AvailabilityRow {
  id: string;
  staff_id: string;
  weekday: number | null;
  date: string | null;
  date_to: string | null;
  start_time: string | null;
  end_time: string | null;
  is_off: boolean;
  reason: string | null;
}

export type StaffInput = Omit<StaffRow, 'id' | 'user_id'> & { id?: string | undefined };

export interface WeeklyRuleInput {
  weekday: number;
  start_time: string | null;
  end_time: string | null;
  is_off: boolean;
}

export interface LeaveInput {
  staff_id: string;
  date: string;
  date_to: string | null;
  reason: string | null;
}

const STAFF_COLUMNS =
  'id, user_id, display_name, phone_e164, skills, home_zone_id, is_team_lead, pay_type, pay_rate_tzs, active';
const AVAILABILITY_COLUMNS = 'id, staff_id, weekday, date, date_to, start_time, end_time, is_off, reason';

interface Result {
  data: unknown;
  error: unknown;
}

function unwrap<T>(res: Result): T {
  if (res.error) throw asError(res.error);
  return res.data as T;
}

export async function listStaff(): Promise<StaffRow[]> {
  return unwrap<StaffRow[]>(
    await supabase
      .from('staff')
      .select(STAFF_COLUMNS)
      .order('active', { ascending: false })
      .order('display_name'),
  );
}

export async function getStaff(id: string): Promise<StaffRow> {
  return unwrap<StaffRow>(await supabase.from('staff').select(STAFF_COLUMNS).eq('id', id).single());
}

export async function saveStaff(input: StaffInput): Promise<StaffRow> {
  const { id, ...fields } = input;
  const query = id
    ? supabase.from('staff').update(fields).eq('id', id)
    : supabase.from('staff').insert(fields);
  return unwrap<StaffRow>(await query.select(STAFF_COLUMNS).single());
}

export async function listAvailability(staffId: string): Promise<AvailabilityRow[]> {
  return unwrap<AvailabilityRow[]>(
    await supabase
      .from('staff_availability')
      .select(AVAILABILITY_COLUMNS)
      .eq('staff_id', staffId)
      .order('weekday', { nullsFirst: false })
      .order('date'),
  );
}

/** Replace the weekly pattern wholesale: the grid is the source of truth. */
export async function replaceWeekly(staffId: string, rules: WeeklyRuleInput[]): Promise<AvailabilityRow[]> {
  unwrap<unknown>(
    await supabase
      .from('staff_availability')
      .delete()
      .eq('staff_id', staffId)
      .not('weekday', 'is', null)
      .select('id'),
  );
  if (rules.length === 0) return [];
  const rows = rules.map((r) => ({
    staff_id: staffId,
    weekday: r.weekday,
    start_time: r.is_off ? null : r.start_time,
    end_time: r.is_off ? null : r.end_time,
    is_off: r.is_off,
  }));
  return unwrap<AvailabilityRow[]>(
    await supabase.from('staff_availability').insert(rows).select(AVAILABILITY_COLUMNS),
  );
}

export async function addLeave(input: LeaveInput): Promise<AvailabilityRow> {
  return unwrap<AvailabilityRow>(
    await supabase
      .from('staff_availability')
      .insert({ ...input, is_off: true, weekday: null, start_time: null, end_time: null })
      .select(AVAILABILITY_COLUMNS)
      .single(),
  );
}

export async function deleteAvailability(id: string): Promise<void> {
  unwrap<unknown>(await supabase.from('staff_availability').delete().eq('id', id).select('id'));
}
