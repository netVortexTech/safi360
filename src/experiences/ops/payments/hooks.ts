/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-base-to-string */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useActorMeta } from '@/lib/actor-meta';
import type { PaymentStatus } from '@shared/enums';
import { asError } from '@/lib/errors';

export type PaymentLedgerRow = {
  id: string;
  tenant_id: string;
  booking_id: string;
  kind: 'DEPOSIT' | 'BALANCE';
  provider: 'MOCK' | 'SELCOM' | 'AZAMPAY' | 'MANUAL';
  provider_ref: string | null;
  amount_tzs: number;
  status: PaymentStatus;
  idempotency_key: string | null;
  raw: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
  booking_ticket_ref: string;
  customer_name: string;
};

export const paymentQueryKeys = {
  all: ['payments'] as const,
  ledger: () => ['payments', 'ledger'] as const,
  detail: (id: string) => ['payments', 'detail', id] as const,
};

export function usePaymentsLedger() {
  return useQuery({
    queryKey: paymentQueryKeys.ledger(),
    queryFn: async (): Promise<PaymentLedgerRow[]> => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'id, tenant_id, booking_id, kind, provider, provider_ref, amount_tzs, status, idempotency_key, raw, completed_at, created_at, booking:bookings!inner(ticket_ref, customer:customers(name))',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw asError(error);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      return rows.map((row) => ({
        id: String(row.id),
        tenant_id: String(row.tenant_id),
        booking_id: String(row.booking_id),
        kind: (row.kind as PaymentLedgerRow['kind']) ?? 'DEPOSIT',
        provider: row.provider as PaymentLedgerRow['provider'],
        provider_ref: typeof row.provider_ref === 'string' ? row.provider_ref : null,
        amount_tzs: Number(row.amount_tzs ?? 0),
        status: row.status as PaymentStatus,
        idempotency_key: typeof row.idempotency_key === 'string' ? row.idempotency_key : null,
        raw: (row.raw ?? {}) as Record<string, unknown>,
        completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
        created_at: String(row.created_at ?? ''),
        booking_ticket_ref: String((row.booking as Record<string, unknown> | null)?.ticket_ref ?? ''),
        customer_name: String(
          ((row.booking as Record<string, unknown> | null)?.customer as Record<string, unknown> | null)
            ?.name ?? '',
        ),
      }));
    },
    staleTime: 30_000,
  });
}

export function useRecordManualPayment() {
  const qc = useQueryClient();
  const actorMeta = useActorMeta();
  return useMutation({
    meta: { errorHandled: true },
    mutationFn: async (vars: { booking_id: string; amount_tzs: number; method: string; reason: string }) => {
      const { data, error } = await supabase.rpc('record_manual_payment', {
        p_booking_id: vars.booking_id,
        p_amount_tzs: vars.amount_tzs,
        p_method: vars.method,
        p_reason: vars.reason,
        p_meta: actorMeta,
      });
      if (error) throw asError(error);
      return data as string;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: paymentQueryKeys.all });
      void qc.invalidateQueries({ queryKey: ['tickets'] });
      void qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}
