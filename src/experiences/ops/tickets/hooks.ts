/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unnecessary-type-assertion */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { darDayRange } from '@/lib/dates';
import type {
  AuditLogRow,
  BookingBySource,
  CalendarEvent,
  DashboardKpis,
  DispatchItem,
  ExceptionRow,
  JobEventRow,
  NeedsActionItem,
  PaymentRow,
  QuoteRow,
  TicketFilters,
  TicketRow,
} from './types';
import { emptyTicketFilters } from './types';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const ticketKeys = {
  all: ['tickets'] as const,
  list: (filters: Partial<TicketFilters>) => ['tickets', 'list', filters] as const,
  detail: (id: string) => ['tickets', 'detail', id] as const,
  events: (id: string) => ['tickets', 'events', id] as const,
  payments: (id: string) => ['tickets', 'payments', id] as const,
  quotes: (id: string) => ['tickets', 'quotes', id] as const,
  audit: (id: string) => ['tickets', 'audit', id] as const,
  dashboard: ['dashboard'] as const,
  calendar: (start: string, end: string) => ['calendar', start, end] as const,
  dispatch: (date: string) => ['dispatch', date] as const,
  exceptions: ['exceptions'] as const,
  sources: ['bookings-by-source'] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTicketQuery(filters: Partial<TicketFilters>) {
  let query = supabase
    .from('bookings')
    .select(
      `
      id, tenant_id, ticket_ref, customer_id, status, source,
      scheduled_start, scheduled_end, duration_min, crew_size, flags,
      total_tzs, deposit_tzs, paid_tzs, payment_mode,
      notes_customer, notes_internal, address_snapshot, zone_id, locale,
      hold_expires_at, confirmed_at, completed_at, cancelled_at,
      created_at, updated_at,
      customer:customers!inner(name, phone_e164),
      quote:quotes(id, status, total_tzs, deposit_tzs, requires_review, has_estimate, revised_from_id, expires_at, sent_at, decided_at, created_at),
      items:booking_items(id, service_id, label_en, label_sw, qty, amount_tzs, requires_review),
      assignments(id, staff_id, is_lead, cancelled_at, staff:staff(display_name))
    `,
    )
    .order('created_at', { ascending: false });

  if (filters.search) {
    const s = filters.search.replace(/[%_]/g, '');
    query = query.or(`ticket_ref.ilike.%${s}%,customers.name.ilike.%${s}%,customers.phone_e164.ilike.%${s}%`);
  }
  if (filters.source) query = query.eq('source', filters.source);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.date_from) {
    query = query.or(
      `scheduled_start.gte.${filters.date_from},and(scheduled_start.is.null,created_at.gte.${filters.date_from})`,
    );
  }
  if (filters.date_to) {
    const end = filters.date_to + 'T23:59:59.999Z';
    query = query.or(`scheduled_start.lte.${end},and(scheduled_start.is.null,created_at.lte.${end})`);
  }
  if (filters.service_id) {
    query = query.eq('items.service_id', filters.service_id);
  }
  if (filters.team_id) {
    query = query.eq('assignments.staff_id', filters.team_id);
  }

  return query;
}

function mapTicketRow(row: Record<string, unknown>): TicketRow {
  const customer = row.customer as { name: string; phone_e164: string } | null;
  const quote = row.quote as Record<string, unknown> | null;
  const items = (row.items as Record<string, unknown>[]) ?? [];
  const assignments = ((row.assignments as Record<string, unknown>[]) ?? []).filter(
    (a) => a.cancelled_at == null,
  );

  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    ticket_ref: row.ticket_ref as string,
    customer_id: row.customer_id as string,
    customer_name: customer?.name ?? '',
    customer_phone: customer?.phone_e164 ?? '',
    status: row.status as TicketRow['status'],
    source: row.source as TicketRow['source'],
    scheduled_start: row.scheduled_start as string | null,
    scheduled_end: row.scheduled_end as string | null,
    duration_min: row.duration_min as number,
    crew_size: row.crew_size as number,
    flags: (row.flags as TicketRow['flags']) ?? [],
    total_tzs: row.total_tzs as number,
    deposit_tzs: row.deposit_tzs as number,
    paid_tzs: row.paid_tzs as number,
    payment_mode: row.payment_mode as TicketRow['payment_mode'],
    notes_customer: row.notes_customer as string | null,
    notes_internal: row.notes_internal as string | null,
    address_snapshot: (row.address_snapshot as Record<string, unknown>) ?? {},
    zone_id: row.zone_id as string | null,
    locale: row.locale as TicketRow['locale'],
    hold_expires_at: row.hold_expires_at as string | null,
    confirmed_at: row.confirmed_at as string | null,
    completed_at: row.completed_at as string | null,
    cancelled_at: row.cancelled_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    quote_id: quote?.id as string | null,
    quote_status: quote?.status as string | null,
    quote_total_tzs: quote?.total_tzs as number | null,
    services: items.map((i) => (i.label_en as string) || (i.label_sw as string)),
    assignee_names: assignments.map((a) => {
      const s = a.staff as { display_name: string };
      return s.display_name;
    }),
  };
}

// ---------------------------------------------------------------------------
// Tickets list
// ---------------------------------------------------------------------------

export function useTickets(filters: Partial<TicketFilters> = {}) {
  return useQuery({
    queryKey: ticketKeys.list(filters),
    queryFn: async () => {
      const { data, error } = await buildTicketQuery(filters);
      if (error) throw error;
      return (data as Record<string, unknown>[]).map(mapTicketRow);
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Ticket detail
// ---------------------------------------------------------------------------

export function useTicket(id: string) {
  return useQuery({
    queryKey: ticketKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id, tenant_id, ticket_ref, customer_id, status, source,
          scheduled_start, scheduled_end, duration_min, crew_size, flags,
          total_tzs, deposit_tzs, paid_tzs, payment_mode,
          notes_customer, notes_internal, address_snapshot, zone_id, locale,
          hold_expires_at, confirmed_at, completed_at, cancelled_at,
          created_at, updated_at, outcome_reason,
          customer:customers!inner(name, phone_e164, email, locale, phone_verified_at),
          quote:quotes(id, status, total_tzs, deposit_tzs, requires_review, has_estimate, revised_from_id, expires_at, sent_at, decided_at, created_at),
          quotes:quotes(id, status, total_tzs, deposit_tzs, requires_review, has_estimate, revised_from_id, expires_at, sent_at, decided_at, created_at),
          items:booking_items(id, service_id, label_en, label_sw, input, qty, amount_tzs, requires_review),
          assignments(id, staff_id, is_lead, starts_at, ends_at, cancelled_at, staff:staff(display_name, phone_e164))
        `,
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as Record<string, unknown>;
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Job events (timeline)
// ---------------------------------------------------------------------------

export function useJobEvents(bookingId: string) {
  return useQuery({
    queryKey: ticketKeys.events(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_events')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as unknown as JobEventRow[];
    },
    staleTime: 30_000,
    enabled: !!bookingId,
  });
}

// ---------------------------------------------------------------------------
// Payments for a booking
// ---------------------------------------------------------------------------

export function useBookingPayments(bookingId: string) {
  return useQuery({
    queryKey: ticketKeys.payments(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
    staleTime: 30_000,
    enabled: !!bookingId,
  });
}

// ---------------------------------------------------------------------------
// Quotes for a booking
// ---------------------------------------------------------------------------

export function useBookingQuotes(bookingId: string) {
  return useQuery({
    queryKey: ticketKeys.quotes(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as QuoteRow[];
    },
    staleTime: 30_000,
    enabled: !!bookingId,
  });
}

// ---------------------------------------------------------------------------
// Audit trail for a booking
// ---------------------------------------------------------------------------

export function useBookingAudit(bookingId: string) {
  return useQuery({
    queryKey: ticketKeys.audit(bookingId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity', 'booking')
        .eq('entity_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as AuditLogRow[];
    },
    staleTime: 30_000,
    enabled: !!bookingId,
  });
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function useDashboard() {
  return useQuery({
    queryKey: ticketKeys.dashboard,
    queryFn: async (): Promise<{
      kpis: DashboardKpis;
      needs_action: NeedsActionItem[];
      recent_tickets: TicketRow[];
      by_source: BookingBySource[];
    }> => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [bookedsRes, exceptionsRes, sourcesRes] = await Promise.all([
        supabase
          .from('bookings')
          .select(
            `
            id, tenant_id, ticket_ref, customer_id, status, source,
            scheduled_start, scheduled_end, duration_min, crew_size, flags,
            total_tzs, deposit_tzs, paid_tzs, payment_mode,
            notes_customer, notes_internal, address_snapshot, zone_id, locale,
            hold_expires_at, confirmed_at, completed_at, cancelled_at,
            created_at, updated_at,
            customer:customers!inner(name, phone_e164),
            items:booking_items(id, service_id, label_en, label_sw, qty, amount_tzs),
            assignments(id, staff_id, cancelled_at, staff:staff(display_name))
          `,
          )
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('exceptions')
          .select('id, kind, severity, status, booking_id, created_at')
          .eq('status', 'OPEN')
          .order('created_at', { ascending: false }),
        supabase.from('bookings').select('source').order('created_at', { ascending: false }).limit(500),
      ]);

      if (bookedsRes.error) throw bookedsRes.error;
      if (exceptionsRes.error) throw exceptionsRes.error;
      if (sourcesRes.error) throw sourcesRes.error;

      const allBookings = (bookedsRes.data ?? []) as Record<string, unknown>[];
      const exceptions = exceptionsRes.data ?? [];
      const sources = (sourcesRes.data ?? []) as { source: BookingBySource['source'] }[];

      const mapped = allBookings.map(mapTicketRow);

      // KPIs
      const todaysJobs = mapped.filter((b) => {
        if (!b.scheduled_start) return false;
        const d = new Date(b.scheduled_start);
        return d >= today;
      });

      const activeBookings = mapped.filter((b) =>
        ['CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status),
      );
      const bookedValue = activeBookings.reduce((s, b) => s + b.total_tzs, 0);
      const collected = activeBookings.reduce((s, b) => s + b.paid_tzs, 0);
      const pending = bookedValue - collected;

      // Needs action
      const needsAction: NeedsActionItem[] = [];

      // Bookings needing review
      const reviewBookings = mapped.filter((b) => b.status === 'AWAITING_REVIEW');
      for (const b of reviewBookings) {
        needsAction.push({
          booking_id: b.id,
          ticket_ref: b.ticket_ref,
          customer_name: b.customer_name,
          status: b.status,
          reason: 'Quote needs review before sending to customer',
          priority: 'high',
          created_at: b.created_at,
        });
      }

      // Expiring holds
      const now = Date.now();
      const expiringHolds = mapped.filter((b) => {
        if (!b.hold_expires_at) return false;
        const exp = new Date(b.hold_expires_at).getTime();
        return exp > now && exp - now < 30 * 60 * 1000; // 30 min
      });
      for (const b of expiringHolds) {
        needsAction.push({
          booking_id: b.id,
          ticket_ref: b.ticket_ref,
          customer_name: b.customer_name,
          status: b.status,
          reason: 'Slot hold expiring soon',
          priority: 'high',
          created_at: b.hold_expires_at!,
        });
      }

      // Unassigned confirmed
      const unassigned = mapped.filter((b) => b.status === 'CONFIRMED' && b.assignee_names.length === 0);
      for (const b of unassigned) {
        needsAction.push({
          booking_id: b.id,
          ticket_ref: b.ticket_ref,
          customer_name: b.customer_name,
          status: b.status,
          reason: 'No cleaner assigned yet',
          priority: 'normal',
          created_at: b.created_at,
        });
      }

      // Open exceptions as needs-action items
      for (const ex of exceptions.slice(0, 10)) {
        const booking = mapped.find((b) => b.id === ex.booking_id);
        needsAction.push({
          booking_id: ex.booking_id ?? '',
          ticket_ref: booking?.ticket_ref ?? '',
          customer_name: booking?.customer_name ?? '',
          status: booking?.status ?? 'AWAITING_REVIEW',
          reason: `Exception: ${ex.kind}`,
          priority: ex.severity === 'high' ? 'high' : 'normal',
          created_at: ex.created_at,
        });
      }

      needsAction.sort((a, b) => {
        const p = { high: 0, normal: 1, low: 2 };
        return p[a.priority] - p[b.priority];
      });

      // By source
      const sourceMap = new Map<string, number>();
      for (const s of sources) {
        sourceMap.set(s.source, (sourceMap.get(s.source) ?? 0) + 1);
      }
      const bySource: BookingBySource[] = Array.from(sourceMap.entries()).map(([source, count]) => ({
        source: source as BookingBySource['source'],
        count,
      }));

      return {
        kpis: {
          todays_jobs: todaysJobs.length,
          needs_action: needsAction.length,
          booked_value_tzs: bookedValue,
          collected_tzs: collected,
          pending_tzs: pending,
          open_exceptions: exceptions.length,
        },
        needs_action: needsAction.slice(0, 10),
        recent_tickets: mapped.slice(0, 8),
        by_source: bySource,
      };
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export function useCalendarEvents(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ticketKeys.calendar(startDate, endDate),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id, ticket_ref, customer_id, status,
          scheduled_start, scheduled_end, crew_size,
          address_snapshot, source,
          customer:customers!inner(name),
          items:booking_items(label_en, label_sw),
          assignments(id, staff_id, is_lead, cancelled_at, staff:staff(display_name))
        `,
        )
        .not('scheduled_start', 'is', null)
        .gte('scheduled_start', startDate)
        .lte('scheduled_start', endDate)
        .order('scheduled_start', { ascending: true });
      if (error) throw error;

      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const customer = row.customer as { name: string };
        const items = (row.items as Record<string, unknown>[]) ?? [];
        const assignments = ((row.assignments as Record<string, unknown>[]) ?? []).filter(
          (a) => a.cancelled_at == null,
        );
        return {
          id: row.id as string,
          booking_id: row.id as string,
          ticket_ref: row.ticket_ref as string,
          customer_name: customer.name,
          status: row.status as CalendarEvent['status'],
          scheduled_start: row.scheduled_start as string,
          scheduled_end: row.scheduled_end as string,
          crew_size: row.crew_size as number,
          address_snapshot: row.address_snapshot as Record<string, unknown>,
          services: items.map((i) => (i.label_en as string) || (i.label_sw as string)),
          assignees: assignments.map((a) => ({
            staff_id: a.staff_id as string,
            name: (a.staff as { display_name: string }).display_name,
            is_lead: a.is_lead as boolean,
          })),
          color: 'var(--color-primary)', // default, overridden per-status
        } satisfies CalendarEvent;
      });
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Dispatch board
// ---------------------------------------------------------------------------

export function useDispatchItems(date: string) {
  return useQuery({
    queryKey: ticketKeys.dispatch(date),
    queryFn: async () => {
      // Day bounds in Dar es Salaam wall-clock time, not UTC midnight: a job at
      // 01:00 EAT belongs to that Dar date (22:00Z the previous day).
      const { start, end } = darDayRange(date);
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id, ticket_ref, customer_id, status,
          scheduled_start, scheduled_end, crew_size,
          address_snapshot, source,
          customer:customers!inner(name),
          assignments(id, staff_id, cancelled_at, staff:staff(display_name))
        `,
        )
        .not('scheduled_start', 'is', null)
        .gte('scheduled_start', start)
        .lt('scheduled_start', end)
        .order('scheduled_start', { ascending: true });
      if (error) throw error;

      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const customer = row.customer as { name: string };
        const assignments = ((row.assignments as Record<string, unknown>[]) ?? []).filter(
          (a) => a.cancelled_at == null,
        );
        const assignees = assignments.map((a) => ({
          assignment_id: a.id as string,
          staff_id: a.staff_id as string,
          name: (a.staff as { display_name: string } | null)?.display_name ?? (a.staff_id as string),
        }));
        return {
          booking_id: row.id as string,
          ticket_ref: row.ticket_ref as string,
          customer_name: customer.name,
          status: row.status as DispatchItem['status'],
          scheduled_start: row.scheduled_start as string,
          scheduled_end: row.scheduled_end as string,
          crew_size: row.crew_size as number,
          address_snapshot: row.address_snapshot as Record<string, unknown>,
          assignee_ids: assignees.map((a) => a.staff_id),
          assignees,
          source: row.source as DispatchItem['source'],
        };
      });
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export function useExceptions() {
  return useQuery({
    queryKey: ticketKeys.exceptions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('exceptions')
        .select(
          `
          id, booking_id, kind, severity, status, details,
          resolved_by, resolved_at, created_at,
          booking:bookings(ticket_ref, status, locale, duration_min, scheduled_start, scheduled_end, customer:customers(id, name))
        `,
        )
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      return ((data ?? []) as Record<string, unknown>[]).map((row): ExceptionRow => {
        const booking = row.booking as {
          ticket_ref: string;
          status: string;
          locale: string;
          duration_min: number;
          scheduled_start: string | null;
          scheduled_end: string | null;
          customer: { id: string; name: string };
        } | null;
        const details = (row.details as Record<string, unknown>) ?? {};
        const preferred = typeof details.preferred_start === 'string' ? details.preferred_start : null;
        return {
          id: row.id as string,
          tenant_id: '',
          booking_id: row.booking_id as string | null,
          ticket_ref: booking?.ticket_ref ?? null,
          customer_name: booking?.customer.name ?? null,
          kind: row.kind as string,
          severity: row.severity as ExceptionRow['severity'],
          status: row.status as ExceptionRow['status'],
          details: row.details as Record<string, unknown>,
          resolved_by: row.resolved_by as string | null,
          resolved_at: row.resolved_at as string | null,
          created_at: row.created_at as string,
          reschedule:
            row.kind === 'RESCHEDULE_REQUESTED' && preferred && booking
              ? {
                  preferred_start: preferred,
                  note: typeof details.note === 'string' ? details.note : null,
                  duration_min: booking.duration_min ?? null,
                  booking_status: booking.status,
                  current_start: booking.scheduled_start,
                  current_end: booking.scheduled_end,
                  customer_id: booking.customer?.id ?? null,
                  locale: booking.locale === 'en' ? 'en' : 'sw',
                }
              : null,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; action: 'RESOLVED' | 'DISMISSED' }) => {
      const { error } = await supabase
        .from('exceptions')
        .update({
          status: vars.action,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.exceptions });
      qc.invalidateQueries({ queryKey: ticketKeys.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Customer-visible timeline event (ops-authored, e.g. request declined)
// ---------------------------------------------------------------------------

export function useAddJobEvent() {
  const actorMeta = useActorMeta();
  return useMutation({
    mutationFn: async (vars: {
      booking_id: string;
      kind: 'note' | 'customer_action' | 'payment' | 'assignment' | 'reschedule_requested';
      customer_visible: boolean;
      message_key?: string;
      data?: Record<string, unknown>;
    }) => {
      const { error } = await supabase.rpc('add_job_event', {
        p_booking_id: vars.booking_id,
        p_kind: vars.kind,
        p_customer_visible: vars.customer_visible,
        p_message_key: vars.message_key ?? null,
        p_data: vars.data ?? {},
        p_meta: actorMeta,
      });
      if (error) throw error;
    },
  });
}

// ---------------------------------------------------------------------------
// Queue an SMS/WhatsApp notification (picked up when a provider is connected)
// ---------------------------------------------------------------------------

export interface QueueNotificationVars {
  tenant_id: string;
  booking_id: string | null;
  customer_id: string | null;
  channel: 'SMS' | 'WHATSAPP';
  template_key: string;
  locale: 'sw' | 'en';
  variables: Record<string, unknown>;
}

export function useQueueNotification() {
  return useMutation({
    mutationFn: async (vars: QueueNotificationVars) => {
      const { error } = await supabase.from('notifications').insert({
        tenant_id: vars.tenant_id,
        booking_id: vars.booking_id,
        customer_id: vars.customer_id,
        channel: vars.channel,
        template_key: vars.template_key,
        locale: vars.locale,
        variables: vars.variables,
      });
      if (error) throw error;
    },
  });
}

// ---------------------------------------------------------------------------
// Transition booking (shared by ticket detail actions)
// ---------------------------------------------------------------------------

/**
 * Explicit staff actor for the write path, in the same shape the Edge Functions
 * send (`staff:<uuid>` + tenant role). Databases with correct JWT-claim wiring
 * ignore it (claims win); it keeps attribution and role checks working where
 * the claims do not reach the RPC.
 */
function useActorMeta(): Record<string, unknown> {
  const { userId, claims } = useAuth();
  if (!userId || !claims.tenant_role) return {};
  return { actor: `staff:${userId}`, actor_role: claims.tenant_role };
}

export function useTransitionBooking() {
  const qc = useQueryClient();
  const actorMeta = useActorMeta();
  return useMutation({
    mutationFn: async (vars: {
      booking_id: string;
      to: TicketRow['status'];
      reason?: string | undefined;
      meta?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('transition_booking', {
        p_booking_id: vars.booking_id,
        p_to: vars.to,
        p_reason: vars.reason ?? null,
        p_meta: { ...actorMeta, ...vars.meta },
      });
      if (error) throw error;
      return data as { booking_id: string; status: string; changed: boolean };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(vars.booking_id) });
      qc.invalidateQueries({ queryKey: ticketKeys.list(emptyTicketFilters) });
      qc.invalidateQueries({ queryKey: ticketKeys.dashboard });
      qc.invalidateQueries({ queryKey: ticketKeys.exceptions });
    },
  });
}

// ---------------------------------------------------------------------------
// Reschedule booking
// ---------------------------------------------------------------------------

export function useRescheduleBooking() {
  const qc = useQueryClient();
  const actorMeta = useActorMeta();
  return useMutation({
    mutationFn: async (vars: {
      booking_id: string;
      start: string;
      end: string;
      capacity: number;
      reason?: string;
      meta?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase.rpc('reschedule_booking', {
        p_booking_id: vars.booking_id,
        p_start: vars.start,
        p_end: vars.end,
        p_capacity: vars.capacity,
        p_reason: vars.reason ?? null,
        p_meta: { ...actorMeta, ...vars.meta },
      });
      if (error) throw error;
      return data as { booking_id: string; scheduled_start: string; scheduled_end: string };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(vars.booking_id) });
      qc.invalidateQueries({ queryKey: ticketKeys.list(emptyTicketFilters) });
      qc.invalidateQueries({ queryKey: ticketKeys.dashboard });
    },
  });
}

// ---------------------------------------------------------------------------
// Add internal note
// ---------------------------------------------------------------------------

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { booking_id: string; note: string; customer_visible: boolean }) => {
      const { data, error } = await supabase.rpc('add_job_event', {
        p_booking_id: vars.booking_id,
        p_kind: 'note',
        p_customer_visible: vars.customer_visible,
        p_data: { note: vars.note },
        p_meta: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.events(vars.booking_id) });
    },
  });
}

// ---------------------------------------------------------------------------
// Assignment candidates for the dispatch drawer
// ---------------------------------------------------------------------------

export function useAssignmentCandidates(bookingId: string, start: string, end: string, crewSize: number) {
  return useQuery({
    queryKey: ['assignment-candidates', bookingId, start, end, crewSize],
    queryFn: async () => {
      // Get booking services
      const { data: itemsRes, error: itemsErr } = await supabase
        .from('booking_items')
        .select('service_id')
        .eq('booking_id', bookingId);
      if (itemsErr) throw itemsErr;

      const serviceIds = ((itemsRes ?? []) as { service_id: string }[])
        .map((i) => i.service_id)
        .filter(Boolean);

      // Get all active staff
      const { data: staffRes, error: staffErr } = await supabase
        .from('staff')
        .select('id, display_name, skills, home_zone_id, is_team_lead, active')
        .eq('active', true);
      if (staffErr) throw staffErr;

      const staff = (staffRes ?? []) as {
        id: string;
        display_name: string;
        skills: string[];
        home_zone_id: string | null;
        is_team_lead: boolean;
      }[];

      // Get existing assignments in the time window to check conflicts
      const { data: assignRes, error: assignErr } = await supabase
        .from('assignments')
        .select('staff_id, starts_at, ends_at')
        .lt('starts_at', end)
        .gt('ends_at', start);
      if (assignErr) throw assignErr;

      const conflicts = new Map<string, number>();
      for (const a of (assignRes ?? []) as { staff_id: string }[]) {
        conflicts.set(a.staff_id, (conflicts.get(a.staff_id) ?? 0) + 1);
      }

      // Build candidates
      return staff
        .filter((s) => {
          if (serviceIds.length === 0) return true;
          return serviceIds.every((sid) => s.skills.includes(sid));
        })
        .map((s) => {
          const load = conflicts.get(s.id) ?? 0;
          return {
            staff_id: s.id,
            name: s.display_name,
            skills: s.skills,
            current_load: load,
            distance_km: null,
            available: load === 0,
            conflict_reason: load > 0 ? `Already assigned to ${load} job(s) in this window` : null,
          };
        })
        .sort((a, b) => {
          // Available first, then by load
          if (a.available !== b.available) return a.available ? -1 : 1;
          return a.current_load - b.current_load;
        });
    },
    staleTime: 15_000,
    enabled: !!bookingId && !!start && !!end,
  });
}

// ---------------------------------------------------------------------------
// Create assignment (manual only)
// ---------------------------------------------------------------------------

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      booking_id: string;
      staff_id: string;
      starts_at: string;
      ends_at: string;
      is_lead: boolean;
    }) => {
      const { data: existing } = await supabase
        .from('assignments')
        .select('id')
        .eq('booking_id', vars.booking_id)
        .eq('staff_id', vars.staff_id)
        .single();

      if (existing) return existing;

      const { data, error } = await supabase
        .from('assignments')
        .insert({
          booking_id: vars.booking_id,
          staff_id: vars.staff_id,
          starts_at: vars.starts_at,
          ends_at: vars.ends_at,
          is_lead: vars.is_lead,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all });
      qc.invalidateQueries({ queryKey: ['dispatch'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Cancel assignment
// ---------------------------------------------------------------------------

export function useCancelAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('assignments')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', assignmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all });
      qc.invalidateQueries({ queryKey: ['dispatch'] });
    },
  });
}
