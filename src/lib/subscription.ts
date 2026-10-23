import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { asError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';

export interface SubscriptionStatus {
  status: TenantStatus | 'NO_TENANT';
  planId: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
  isTrialExpired: boolean;
  canAccessSystem: boolean;
  paymentUrl: string;
}

/** Where a company pays until the payment callback (PRODUCTION_READINESS §4) activates it. */
export const PAYMENT_URL = 'https://snippe.me/pay/safi360';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  status: (tenantId: string | null) => ['subscription', 'status', tenantId] as const,
};

/** The platform-managed columns of public.tenants the gate decides from. */
export interface TenantSubscriptionRow {
  status: TenantStatus;
  plan_id: string | null;
  trial_ends_at: string | null;
  deleted_at: string | null;
}

const NO_TENANT: SubscriptionStatus = {
  status: 'NO_TENANT',
  planId: null,
  trialEndsAt: null,
  daysRemaining: null,
  isTrialExpired: false,
  canAccessSystem: false,
  paymentUrl: PAYMENT_URL,
};

/** Pure: turn the tenant row into an access decision. Exported for tests. */
export function deriveSubscriptionStatus(
  row: TenantSubscriptionRow | null,
  now = new Date(),
): SubscriptionStatus {
  if (!row || row.deleted_at) return NO_TENANT;
  const trialEndsAt = row.trial_ends_at;
  const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
  const isTrialExpired = trialEnd != null && trialEnd < now;
  const daysRemaining =
    trialEnd && !isTrialExpired ? Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000) : null;
  let canAccessSystem = false;
  if (row.status === 'ACTIVE') canAccessSystem = row.plan_id != null;
  else if (row.status === 'TRIAL') canAccessSystem = !isTrialExpired;
  return {
    status: row.status,
    planId: row.plan_id,
    trialEndsAt,
    daysRemaining,
    isTrialExpired,
    canAccessSystem,
    paymentUrl: PAYMENT_URL,
  };
}

/** Reads the caller's own tenant through RLS (tenants_select shows exactly that one row). */
export async function fetchSubscriptionStatus(tenantId: string): Promise<SubscriptionStatus> {
  const res: { data: unknown; error: unknown } = await supabase
    .from('tenants')
    .select('status, plan_id, trial_ends_at, deleted_at')
    .eq('id', tenantId)
    .maybeSingle();
  if (res.error) throw asError(res.error);
  return deriveSubscriptionStatus(res.data as TenantSubscriptionRow | null);
}

export interface UseSubscriptionStatus {
  /** null while loading, on error, or when the user has no tenant claim. */
  status: SubscriptionStatus | null;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * The signed-in user's tenant subscription. Keyed on the tenant claim, so it is off for
 * visitors and for accounts that have no company yet; a failed read is an error (never a
 * silent "no tenant"), so a flaky network cannot bounce a paying company to /signup.
 */
export function useSubscriptionStatus(): UseSubscriptionStatus {
  const auth = useAuth();
  const tenantId = auth.claims.tenant_id;
  const query = useQuery({
    queryKey: subscriptionKeys.status(tenantId),
    queryFn: () => fetchSubscriptionStatus(tenantId as string),
    enabled: auth.status === 'signed_in' && tenantId != null,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const { refetch: doRefetch } = query;
  const refetch = useCallback(() => {
    void doRefetch();
  }, [doRefetch]);

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch,
  };
}
