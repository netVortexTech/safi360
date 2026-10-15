import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { asError } from '@/lib/errors';

export interface QueuedReminder {
  id: string;
  booking_id: string;
  template_key: string;
  locale: string;
  status: string;
  scheduled_for: string;
  variables: Record<string, unknown>;
  ticket_ref: string | null;
  customer_name: string | null;
}

export const reminderKeys = {
  all: ['reminders'] as const,
  queued: ['reminders', 'queued'] as const,
};

export function useQueuedReminders() {
  return useQuery({
    queryKey: reminderKeys.queued,
    queryFn: async (): Promise<QueuedReminder[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          `id, booking_id, template_key, locale, status, scheduled_for, variables,
           booking:bookings(ticket_ref, customer:customers(name))`,
        )
        .in('status', ['queued', 'sent'])
        .order('scheduled_for', { ascending: true })
        .limit(200);
      if (error) throw asError(error);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const booking = (row.booking ?? null) as { ticket_ref: string; customer: { name: string } } | null;
        const variables = (row.variables ?? {}) as Record<string, unknown>;
        return {
          id: row.id as string,
          booking_id: row.booking_id as string,
          template_key: row.template_key as string,
          locale: row.locale as string,
          status: row.status as string,
          scheduled_for: row.scheduled_for as string,
          variables,
          ticket_ref: booking?.ticket_ref ?? null,
          customer_name: booking?.customer?.name ?? null,
        };
      });
    },
    staleTime: 30_000,
  });
}

/** Queue day-before + balance reminders for the caller's staff tenant. */
export function useQueueReminders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const res: { data: unknown; error: { message: string } | null } =
        await supabase.rpc('queue_booking_reminders');
      if (res.error) throw new Error(res.error.message);
      return typeof res.data === 'number' ? res.data : 0;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reminderKeys.all });
    },
  });
}
