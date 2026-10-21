import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';

export interface SubscriptionStatus {
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'NO_TENANT';
  planId: string | null;
  trialEndsAt: string | null;
  daysRemaining: number | null;
  isTrialExpired: boolean;
  canAccessSystem: boolean;
  paymentUrl: string;
}

/**
 * Check the current user's tenant subscription status.
 * Returns detailed status for access control decisions.
 */
export function useSubscriptionStatus(): {
  status: SubscriptionStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const auth = useAuth();

  const query = useQuery<SubscriptionStatus>({
    queryKey: ['subscription', 'status', auth.userId],
    queryFn: async (): Promise<SubscriptionStatus> => {
      if (!auth.userId) {
        return {
          status: 'NO_TENANT',
          planId: null,
          trialEndsAt: null,
          daysRemaining: null,
          isTrialExpired: false,
          canAccessSystem: false,
          paymentUrl: 'https://snippe.me/pay/safi360',
        };
      }

      // Get user's active membership
      const { data: membership, error: memError } = await supabase
        .from('memberships')
        .select('tenant_id, role')
        .eq('user_id', auth.userId)
        .eq('active', true)
        .single();

      if (memError || !membership) {
        return {
          status: 'NO_TENANT',
          planId: null,
          trialEndsAt: null,
          daysRemaining: null,
          isTrialExpired: false,
          canAccessSystem: false,
          paymentUrl: 'https://snippe.me/pay/safi360',
        };
      }

      // Get tenant details
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, name, status, plan_id, trial_ends_at, deleted_at')
        .eq('id', membership.tenant_id)
        .single();

      if (tenantError || !tenant || tenant.deleted_at) {
        return {
          status: 'NO_TENANT',
          planId: null,
          trialEndsAt: null,
          daysRemaining: null,
          isTrialExpired: false,
          canAccessSystem: false,
          paymentUrl: 'https://snippe.me/pay/safi360',
        };
      }

      const trialEndsAt = tenant.trial_ends_at;
      const now = new Date();
      const isTrialExpired = trialEndsAt ? new Date(trialEndsAt) < now : false;
      let daysRemaining: number | null = null;

      if (trialEndsAt && !isTrialExpired) {
        const diffMs = new Date(trialEndsAt).getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      // Determine access
      let canAccessSystem = false;
      switch (tenant.status) {
        case 'ACTIVE':
          canAccessSystem = Boolean(tenant.plan_id);
          break;
        case 'TRIAL':
          canAccessSystem = !isTrialExpired; // Can access during trial, but will be prompted to select plan
          break;
        case 'PAST_DUE':
        case 'SUSPENDED':
          canAccessSystem = false;
          break;
        default:
          canAccessSystem = false;
      }

      return {
        status: tenant.status as SubscriptionStatus['status'],
        planId: tenant.plan_id,
        trialEndsAt,
        daysRemaining,
        isTrialExpired,
        canAccessSystem,
        paymentUrl: 'https://snippe.me/pay/safi360',
      };
    },
    enabled: auth.status === 'signed_in',
    staleTime: 30_000, // 30 seconds
    refetchOnWindowFocus: true,
  });

  return {
    status: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

/**
 * Prefetch subscription status for SSR or early loading.
 */
export async function prefetchSubscriptionStatus(queryClient: QueryClient, userId: string): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: ['subscription', 'status', userId],
    queryFn: async () => {
      const { data: membership } = await supabase
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', userId)
        .eq('active', true)
        .single();

      if (!membership) {
        return {
          status: 'NO_TENANT' as const,
          planId: null,
          trialEndsAt: null,
          daysRemaining: null,
          isTrialExpired: false,
          canAccessSystem: false,
          paymentUrl: 'https://snippe.me/pay/safi360',
        };
      }

      const { data: tenant } = await supabase
        .from('tenants')
        .select('id, name, status, plan_id, trial_ends_at, deleted_at')
        .eq('id', membership.tenant_id)
        .single();

      if (!tenant || tenant.deleted_at) {
        return {
          status: 'NO_TENANT' as const,
          planId: null,
          trialEndsAt: null,
          daysRemaining: null,
          isTrialExpired: false,
          canAccessSystem: false,
          paymentUrl: 'https://snippe.me/pay/safi360',
        };
      }

      const trialEndsAt = tenant.trial_ends_at;
      const now = new Date();
      const isTrialExpired = trialEndsAt ? new Date(trialEndsAt) < now : false;
      let daysRemaining: number | null = null;

      if (trialEndsAt && !isTrialExpired) {
        const diffMs = new Date(trialEndsAt).getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      }

      let canAccessSystem = false;
      switch (tenant.status) {
        case 'ACTIVE':
          canAccessSystem = Boolean(tenant.plan_id);
          break;
        case 'TRIAL':
          canAccessSystem = !isTrialExpired;
          break;
        default:
          canAccessSystem = false;
      }

      return {
        status: tenant.status as SubscriptionStatus['status'],
        planId: tenant.plan_id,
        trialEndsAt,
        daysRemaining,
        isTrialExpired,
        canAccessSystem,
        paymentUrl: 'https://snippe.me/pay/safi360',
      };
    },
    staleTime: 30_000,
  });
}