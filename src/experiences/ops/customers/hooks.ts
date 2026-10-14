/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-floating-promises, @typescript-eslint/no-unnecessary-type-assertion */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { CustomerAddress, CustomerDuplicate, CustomerRow, TicketRow } from '../tickets/types';

export const customerKeys = {
  all: ['customers'] as const,
  list: (search: string) => ['customers', 'list', search] as const,
  detail: (id: string) => ['customers', 'detail', id] as const,
  addresses: (id: string) => ['customers', 'addresses', id] as const,
  duplicates: (id: string) => ['customers', 'duplicates', id] as const,
  allDuplicates: ['customers', 'duplicates', 'all'] as const,
  bookings: (id: string) => ['customers', 'bookings', id] as const,
  payments: (id: string) => ['customers', 'payments', id] as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCustomerRow(row: Record<string, any>): CustomerRow {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    phone_e164: row.phone_e164 as string,
    name: row.name as string,
    email: row.email as string | null,
    locale: row.locale as CustomerRow['locale'],
    phone_verified_at: row.phone_verified_at as string | null,
    notes_internal: row.notes_internal as string | null,
    first_source: row.first_source as CustomerRow['first_source'],
    tags: (row.tags as string[]) ?? [],
    deleted_at: row.deleted_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    booking_count: (row.booking_count as number) ?? 0,
    total_booked_tzs: (row.total_booked_tzs as number) ?? 0,
    total_paid_tzs: (row.total_paid_tzs as number) ?? 0,
    last_booking_at: row.last_booking_at as string | null,
  };
}

// ---------------------------------------------------------------------------
// Customer list
// ---------------------------------------------------------------------------

export function useCustomers(search: string = '') {
  return useQuery({
    queryKey: customerKeys.list(search),
    queryFn: async () => {
      let query = supabase
        .from('customers')
        .select(
          `
          id, tenant_id, phone_e164, name, email, locale,
          phone_verified_at, notes_internal, first_source, tags,
          deleted_at, created_at, updated_at,
          bookings!inner(id, total_tzs, paid_tzs, created_at)
        `,
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (search) {
        const s = search.replace(/[%_]/g, '');
        query = query.or(`name.ilike.%${s}%,phone_e164.ilike.%${s}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as Record<string, any>[]).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bookings = (row.bookings as Record<string, any>[]) ?? [];
        const totalBooked = bookings.reduce((s: number, b: Record<string, unknown>) => s + (b.total_tzs as number), 0);
        const totalPaid = bookings.reduce((s: number, b: Record<string, unknown>) => s + (b.paid_tzs as number), 0);
        const lastBooking = bookings.length > 0
          ? (bookings as { created_at: string }[]).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.created_at ?? null
          : null;

        return {
          ...mapCustomerRow(row),
          booking_count: bookings.length,
          total_booked_tzs: totalBooked,
          total_paid_tzs: totalPaid,
          last_booking_at: lastBooking,
        };
      });
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Customer detail
// ---------------------------------------------------------------------------

export function useCustomer(id: string) {
  return useQuery({
    queryKey: customerKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single();
      if (error) throw error;
      return mapCustomerRow(data as Record<string, unknown>);
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}

// ---------------------------------------------------------------------------
// Customer addresses
// ---------------------------------------------------------------------------

export function useCustomerAddresses(customerId: string) {
  return useQuery({
    queryKey: customerKeys.addresses(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return data as unknown as CustomerAddress[];
    },
    staleTime: 30_000,
    enabled: !!customerId,
  });
}

// ---------------------------------------------------------------------------
// Customer duplicates
// ---------------------------------------------------------------------------

export function useCustomerDuplicates(customerId: string) {
  return useQuery({
    queryKey: customerKeys.duplicates(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_duplicates')
        .select(
          `
          id, customer_id, duplicate_of_id, reason, status,
          resolved_by, resolved_at, created_at,
          customer:customers!customer_duplicates_customer_id_fkey(name, phone_e164),
          other:customers!customer_duplicates_duplicate_of_id_fkey(name, phone_e164)
        `,
        )
        .or(`customer_id.eq.${customerId},duplicate_of_id.eq.${customerId}`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as Record<string, any>[]).map((row) => {
        const customer = row.customer as { name: string; phone_e164: string };
        const other = row.other as { name: string; phone_e164: string };
        return {
          id: row.id as string,
          customer_id: row.customer_id as string,
          duplicate_of_id: row.duplicate_of_id as string,
          reason: row.reason as string,
          status: row.status as CustomerDuplicate['status'],
          resolved_by: row.resolved_by as string | null,
          resolved_at: row.resolved_at as string | null,
          created_at: row.created_at as string,
          customer_name: customer.name,
          customer_phone: customer.phone_e164,
          other_name: other.name,
          other_phone: other.phone_e164,
        };
      });
    },
    staleTime: 30_000,
    enabled: !!customerId,
  });
}

export function useAllDuplicates() {
  return useQuery({
    queryKey: customerKeys.allDuplicates,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_duplicates')
        .select(
          `
          id, customer_id, duplicate_of_id, reason, status,
          resolved_by, resolved_at, created_at,
          customer:customers!customer_duplicates_customer_id_fkey(name, phone_e164),
          other:customers!customer_duplicates_duplicate_of_id_fkey(name, phone_e164)
        `,
        )
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as Record<string, any>[]).map((row) => {
        const customer = row.customer as { name: string; phone_e164: string };
        const other = row.other as { name: string; phone_e164: string };
        return {
          id: row.id as string,
          customer_id: row.customer_id as string,
          duplicate_of_id: row.duplicate_of_id as string,
          reason: row.reason as string,
          status: row.status as CustomerDuplicate['status'],
          resolved_by: row.resolved_by as string | null,
          resolved_at: row.resolved_at as string | null,
          created_at: row.created_at as string,
          customer_name: customer.name,
          customer_phone: customer.phone_e164,
          other_name: other.name,
          other_phone: other.phone_e164,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useResolveDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; action: 'MERGED' | 'DISMISSED' }) => {
      const { error } = await supabase
        .from('customer_duplicates')
        .update({
          status: vars.action,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all });
      qc.invalidateQueries({ queryKey: ['customers', 'duplicates'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Customer bookings (all tickets for a customer)
// ---------------------------------------------------------------------------

export function useCustomerBookings(customerId: string) {
  return useQuery({
    queryKey: customerKeys.bookings(customerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id, ticket_ref, status, source, scheduled_start, scheduled_end,
          total_tzs, deposit_tzs, paid_tzs, payment_mode, flags,
          created_at, updated_at,
          items:booking_items(label_en, label_sw, qty, amount_tzs),
          assignments(id, staff_id, staff:staff(display_name))
        `,
        )
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as Record<string, any>[]).map((row) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (row.items as Record<string, any>[]) ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assignments = (row.assignments as Record<string, any>[]) ?? [];
        return {
          ...row,
          services: items.map((i) => (i.label_en as string) || (i.label_sw as string)),
          assignee_names: assignments.map((a) => (a.staff as { display_name: string }).display_name),
        } as unknown as TicketRow;
      });
    },
    staleTime: 30_000,
    enabled: !!customerId,
  });
}

// ---------------------------------------------------------------------------
// Search customers by phone or name (for create booking)
// ---------------------------------------------------------------------------

export function useSearchCustomers(query: string) {
  return useQuery({
    queryKey: ['customers', 'search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const { data, error } = await supabase
        .from('customers')
        .select('id, phone_e164, name, email, locale, phone_verified_at, tags')
        .is('deleted_at', null)
        .or(`name.ilike.%${query}%,phone_e164.ilike.%${query.replace(/\+/g, '')}%`)
        .limit(10);
      if (error) throw error;
      return data as CustomerRow[];
    },
    staleTime: 15_000,
    enabled: query.length >= 2,
  });
}

// ---------------------------------------------------------------------------
// Create or update customer
// ---------------------------------------------------------------------------

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      id?: string;
      phone_e164: string;
      name: string;
      email?: string;
      locale?: 'sw' | 'en';
      notes_internal?: string;
      tags?: string[];
    }) => {
      if (vars.id) {
        const { data, error } = await supabase
          .from('customers')
          .update({
            name: vars.name,
            email: vars.email || null,
            locale: vars.locale || 'sw',
            notes_internal: vars.notes_internal || null,
            tags: vars.tags || [],
          })
          .eq('id', vars.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('customers')
        .insert({
          phone_e164: vars.phone_e164,
          name: vars.name,
          email: vars.email || null,
          locale: vars.locale || 'sw',
          notes_internal: vars.notes_internal || null,
          tags: vars.tags || [],
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.all });
    },
  });
}
