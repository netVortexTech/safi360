import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface InvoiceRow {
  id: string;
  ticket_ref: string;
  status: string;
  total_tzs: number;
  deposit_tzs: number;
  paid_tzs: number;
  balance_tzs: number;
  created_at: string;
  scheduled_start: string | null;
  customer_name: string;
  customer_phone: string;
}

export interface InvoiceItem {
  label: string;
  qty: number;
  amount_tzs: number | null;
}

export interface InvoicePayment {
  id: string;
  kind: string;
  provider: string;
  amount_tzs: number;
  status: string;
  created_at: string;
}

export interface InvoiceDetail extends InvoiceRow {
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: ['invoices', 'list'] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
};

function mapRow(row: Record<string, unknown>): InvoiceRow {
  const customer = (row.customer as { name: string; phone_e164: string } | null) ?? {
    name: '',
    phone_e164: '',
  };
  const total = Number(row.total_tzs ?? 0);
  const paid = Number(row.paid_tzs ?? 0);
  return {
    id: row.id as string,
    ticket_ref: row.ticket_ref as string,
    status: row.status as string,
    total_tzs: total,
    deposit_tzs: Number(row.deposit_tzs ?? 0),
    paid_tzs: paid,
    balance_tzs: total - paid,
    created_at: row.created_at as string,
    scheduled_start: (row.scheduled_start as string | null) ?? null,
    customer_name: customer.name,
    customer_phone: customer.phone_e164,
  };
}

/** Every booking is its own invoice (ticket_ref is the invoice number). */
export function useInvoices() {
  return useQuery({
    queryKey: invoiceKeys.list,
    queryFn: async (): Promise<InvoiceRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `id, ticket_ref, status, total_tzs, deposit_tzs, paid_tzs, created_at, scheduled_start,
           customer:customers!inner(name, phone_e164)`,
        )
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(mapRow);
    },
    staleTime: 30_000,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoiceKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<InvoiceDetail> => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          `id, ticket_ref, status, total_tzs, deposit_tzs, paid_tzs, created_at, scheduled_start, scheduled_end,
           customer:customers!inner(name, phone_e164),
           items:booking_items(label_en, label_sw, qty, amount_tzs),
           payments(id, kind, provider, amount_tzs, status, created_at)`,
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      const row = data as unknown as Record<string, unknown>;
      const items = ((row.items as Record<string, unknown>[]) ?? []).map((i) => ({
        label: (i.label_en as string) || (i.label_sw as string) || '',
        qty: Number(i.qty ?? 1),
        amount_tzs: typeof i.amount_tzs === 'number' ? i.amount_tzs : null,
      }));
      const payments = ((row.payments as Record<string, unknown>[]) ?? []).map((p) => ({
        id: p.id as string,
        kind: p.kind as string,
        provider: p.provider as string,
        amount_tzs: Number(p.amount_tzs ?? 0),
        status: p.status as string,
        created_at: p.created_at as string,
      }));
      return { ...mapRow(row), items, payments };
    },
    staleTime: 30_000,
  });
}
