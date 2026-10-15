import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { asError } from '@/lib/errors';

export type FeedbackKind = 'COMMENT' | 'COMPLAINT';
export type FeedbackStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface FeedbackRow {
  id: string;
  booking_id: string;
  ticket_ref: string | null;
  customer_name: string | null;
  kind: FeedbackKind;
  rating: number | null;
  body: string;
  status: FeedbackStatus;
  response: string | null;
  responded_at: string | null;
  created_at: string;
}

export const feedbackKeys = {
  all: ['feedback'] as const,
  list: ['feedback', 'list'] as const,
};

export function useFeedbackList() {
  return useQuery({
    queryKey: feedbackKeys.list,
    queryFn: async (): Promise<FeedbackRow[]> => {
      const { data, error } = await supabase
        .from('booking_feedback')
        .select(
          `id, booking_id, kind, rating, body, status, response, responded_at, created_at,
           booking:bookings(ticket_ref, customer:customers(name))`,
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw asError(error);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const booking = row.booking as { ticket_ref: string; customer: { name: string } } | null;
        return {
          id: row.id as string,
          booking_id: row.booking_id as string,
          ticket_ref: booking?.ticket_ref ?? null,
          customer_name: booking?.customer?.name ?? null,
          kind: row.kind as FeedbackKind,
          rating: typeof row.rating === 'number' ? row.rating : null,
          body: row.body as string,
          status: row.status as FeedbackStatus,
          response: (row.response as string | null) ?? null,
          responded_at: (row.responded_at as string | null) ?? null,
          created_at: row.created_at as string,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status: FeedbackStatus; response?: string | undefined }) => {
      const { error } = await supabase
        .from('booking_feedback')
        .update({
          status: vars.status,
          response: vars.response ?? null,
          responded_at: vars.response ? new Date().toISOString() : null,
        })
        .eq('id', vars.id);
      if (error) throw asError(error);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: feedbackKeys.all });
    },
  });
}
