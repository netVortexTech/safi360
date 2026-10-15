import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { BookingFlag, BookingStatus } from '@shared/enums';

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-type-assertion */

export interface FieldJobService {
  service_id: string;
  label_en: string;
  label_sw: string;
  qty: number;
}

export interface FieldJobAddress {
  label?: string | null;
  area?: string | null;
  street?: string | null;
  landmark?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface FieldJob {
  assignment_id: string;
  staff_id: string;
  is_lead: boolean;
  booking_id: string;
  ticket_ref: string;
  status: BookingStatus;
  flags: BookingFlag[];
  customer_first_name: string;
  customer_phone: string | null;
  customer_note: string | null;
  instructions: string | null;
  address: FieldJobAddress;
  services: FieldJobService[];
  scheduled_start: string;
  scheduled_end: string;
  duration_min: number;
  crew_size: number;
  completed_at: string | null;
}

export interface FieldJobEvent {
  id: number;
  kind: string;
  from_status: BookingStatus | null;
  to_status: BookingStatus | null;
  actor_kind: string;
  actor_label: string | null;
  customer_visible: boolean;
  message_key: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export const fieldQueryKeys = {
  all: ['field'] as const,
  jobs: () => ['field', 'jobs'] as const,
  job: (id: string) => ['field', 'job', id] as const,
  events: (id: string) => ['field', 'events', id] as const,
  staff: () => ['field', 'staff'] as const,
};

function mapJobs(rows: unknown[]): FieldJob[] {
  return rows
    .map((row) => {
      const r = row as Record<string, unknown>;
      const booking = (r.booking ?? {}) as Record<string, unknown>;
      const customer = (booking.customer ?? {}) as Record<string, unknown>;
      const items = (booking.items ?? []) as Record<string, unknown>[];
      const name = String(customer.name ?? '').trim();
      const services: FieldJobService[] = items
        .map((item) => ({
          service_id: String(item.service_id ?? ''),
          label_en: String(item.label_en ?? ''),
          label_sw: String(item.label_sw ?? ''),
          qty: Number(item.qty ?? 1),
        }))
        .filter((item) => item.service_id || item.label_en || item.label_sw);
      return {
        assignment_id: String(r.id ?? ''),
        staff_id: String(r.staff_id ?? ''),
        is_lead: r.is_lead === true,
        booking_id: String(booking.id ?? ''),
        ticket_ref: String(booking.ticket_ref ?? ''),
        status: (booking.status as BookingStatus) ?? 'CONFIRMED',
        flags: (booking.flags as BookingFlag[] | null) ?? [],
        customer_first_name: name ? name.split(/\s+/)[0] || name : 'Customer',
        customer_phone: typeof customer.phone_e164 === 'string' ? customer.phone_e164 : null,
        customer_note: typeof booking.notes_customer === 'string' ? booking.notes_customer : null,
        instructions: typeof booking.notes_internal === 'string' ? booking.notes_internal : null,
        address: (booking.address_snapshot ?? {}) as FieldJob['address'],
        services,
        scheduled_start: String(booking.scheduled_start ?? r.starts_at ?? ''),
        scheduled_end: String(booking.scheduled_end ?? r.ends_at ?? ''),
        duration_min: Number(booking.duration_min ?? 120),
        crew_size: Number(booking.crew_size ?? 1),
        completed_at: typeof booking.completed_at === 'string' ? booking.completed_at : null,
      };
    })
    .filter((job) => job.booking_id && job.scheduled_start)
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

export function useFieldJobs() {
  return useQuery({
    queryKey: fieldQueryKeys.jobs(),
    queryFn: async (): Promise<FieldJob[]> => {
      const { data, error } = await supabase
        .from('assignments')
        .select(
          `
          id, staff_id, is_lead, starts_at, ends_at, cancelled_at,
          booking:bookings!inner(
            id, ticket_ref, status, flags, notes_customer, notes_internal,
            scheduled_start, scheduled_end, duration_min, crew_size, completed_at, address_snapshot,
            customer:customers(name, phone_e164),
            items:booking_items(service_id, label_en, label_sw, qty)
          )
        `,
        )
        .is('cancelled_at', null)
        .order('starts_at', { ascending: true });
      if (error) throw error;
      return mapJobs((data ?? []) as unknown[]);
    },
    staleTime: 30_000,
  });
}

export function useFieldJob(id: string) {
  const jobs = useFieldJobs();
  const job = jobs.data?.find((item) => item.booking_id === id) ?? null;
  return { ...jobs, data: job };
}

export function useFieldEvents(id: string) {
  return useQuery({
    queryKey: fieldQueryKeys.events(id),
    queryFn: async (): Promise<FieldJobEvent[]> => {
      const { data, error } = await supabase
        .from('job_events')
        .select(
          'id, kind, from_status, to_status, actor_kind, actor_label, customer_visible, message_key, data, created_at',
        )
        .eq('booking_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id ?? 0),
        kind: String(row.kind ?? ''),
        from_status: (row.from_status as BookingStatus | null) ?? null,
        to_status: (row.to_status as BookingStatus | null) ?? null,
        actor_kind: String(row.actor_kind ?? ''),
        actor_label: typeof row.actor_label === 'string' ? row.actor_label : null,
        customer_visible: row.customer_visible === true,
        message_key: typeof row.message_key === 'string' ? row.message_key : null,
        data: (row.data ?? {}) as Record<string, unknown>,
        created_at: String(row.created_at ?? ''),
      }));
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useFieldTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { booking_id: string; to: BookingStatus; reason?: string }) => {
      const { data, error } = await supabase.rpc('transition_booking', {
        p_booking_id: vars.booking_id,
        p_to: vars.to,
        p_reason: vars.reason ?? null,
        p_meta: {},
      });
      if (error) throw error;
      return data as { booking_id: string; status: string; changed: boolean };
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: fieldQueryKeys.jobs() });
      void qc.invalidateQueries({ queryKey: fieldQueryKeys.job(vars.booking_id) });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
    },
  });
}

export function useOpenFieldException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { booking_id: string; category: string; reason: string }) => {
      const { data, error } = await supabase.rpc('open_exception', {
        p_booking_id: vars.booking_id,
        p_kind: 'NEEDS_REVIEW',
        p_details: { field_issue: vars.category, reason: vars.reason },
        p_severity: 'normal',
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: fieldQueryKeys.jobs() });
      void qc.invalidateQueries({ queryKey: fieldQueryKeys.events(vars.booking_id) });
    },
  });
}

export function useAddFieldJobEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      booking_id: string;
      kind: string;
      customer_visible?: boolean;
      data?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('add_job_event', {
        p_booking_id: vars.booking_id,
        p_kind: vars.kind,
        p_customer_visible: vars.customer_visible ?? false,
        p_message_key: null,
        p_data: vars.data ?? {},
        p_meta: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: fieldQueryKeys.events(vars.booking_id) });
    },
  });
}
