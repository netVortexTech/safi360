import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { RouteLoading } from '@/app/RouteLoading';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, CreditCard } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { asError } from '@/lib/errors';
import { formatTzs } from '@/lib/money';
import {
  fetchSubscriptionStatus,
  PAYMENT_URL,
  subscriptionKeys,
  useSubscriptionStatus,
} from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
  limits: Record<string, unknown> | null;
}

const ONBOARDING_STEPS = 3;

/**
 * The owner picks a plan. select_plan() (migration 0034) records it server-side; it never
 * changes the tenant status, so the trial keeps running and activation stays with the
 * platform (payment callback or super admin).
 *
 * That means picking a plan only reopens the portal when the tenant could already get in
 * (a running trial, or ACTIVE without a plan). An expired trial, PAST_DUE or SUSPENDED
 * tenant stays blocked until payment lands, so instead of bouncing back to the blocked
 * screen this page shows the payment step and lets the owner check again.
 */
export default function OnboardingPlan() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const subscription = useSubscriptionStatus();
  const [awaitingPayment, setAwaitingPayment] = useState<PlanRow | null>(null);
  const [stillPending, setStillPending] = useState(false);

  const state = location.state as { from?: string; onboarding?: boolean } | null;
  const from = state?.from;
  const next = from && from.startsWith('/') && !from.startsWith('/onboarding') ? from : '/ops';
  const tenantId = auth.claims.tenant_id;
  const isOwner = auth.claims.tenant_role === 'OWNER';

  const plans = useQuery({
    queryKey: ['plans', 'active'],
    enabled: auth.status === 'signed_in' && isOwner,
    queryFn: async (): Promise<PlanRow[]> => {
      const res: { data: unknown; error: unknown } = await supabase
        .from('plans')
        .select('id, name, price_tzs, limits')
        .eq('active', true)
        .order('price_tzs');
      if (res.error) throw asError(res.error);
      return (res.data ?? []) as PlanRow[];
    },
  });

  /** Re-read the tenant and either enter the portal or stay on the payment step. */
  const enterIfAllowed = async (plan: PlanRow | null): Promise<boolean> => {
    if (!tenantId) return false;
    const fresh = await queryClient.fetchQuery({
      queryKey: subscriptionKeys.status(tenantId),
      queryFn: () => fetchSubscriptionStatus(tenantId),
      staleTime: 0,
    });
    if (fresh.canAccessSystem) {
      toast({ title: t('onboarding.plan.success') });
      navigate(next, { replace: true });
      return true;
    }
    if (plan) setAwaitingPayment(plan);
    return false;
  };

  const select = useMutation({
    mutationFn: async (plan: PlanRow) => {
      const res: { error: unknown } = await supabase.rpc('select_plan', { p_plan_id: plan.id });
      if (res.error) throw asError(res.error);
      return plan;
    },
    onSuccess: async (plan) => {
      const entered = await enterIfAllowed(plan);
      if (!entered) toast({ title: t('onboarding.plan.saved') });
    },
    onError: () => toast({ title: t('onboarding.plan.error'), tone: 'error' }),
  });

  const checkAgain = useMutation({
    mutationFn: () => enterIfAllowed(null),
    onSuccess: (entered) => setStillPending(!entered),
    onError: () => toast({ title: t('errors.generic_body'), tone: 'error' }),
  });

  if (auth.status === 'loading') return <RouteLoading />;
  if (auth.status === 'signed_out') return <NavigateToSignup />;
  // Verified a phone but never created the company: finish that first.
  if (tenantId == null) return <Navigate to="/signup" replace />;
  // Only the owner chooses the plan (select_plan() refuses everyone else).
  if (!isOwner) return <Navigate to="/ops" replace />;

  const sub = subscription.status;
  const trialRunning = sub?.status === 'TRIAL' && !sub.isTrialExpired;
  const currentPlanId = sub?.planId ?? null;

  if (awaitingPayment) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-page px-4">
        <Card className="w-full max-w-md">
          <CardBody className="space-y-6 px-6 py-10 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
              <CreditCard className="size-8 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-h2">{t('onboarding.plan.payment_title')}</h1>
              <p className="mt-2 text-text-muted">
                {t('onboarding.plan.payment_body', { plan: awaitingPayment.name })}
              </p>
              <p className="tabular mt-4 text-2xl font-bold">
                {formatTzs(awaitingPayment.price_tzs)}{' '}
                <span className="text-base font-normal text-text-muted">
                  {t('onboarding.plan.per_month')}
                </span>
              </p>
            </div>
            <div className="space-y-3">
              <Button asChild className="w-full" size="lg">
                <a href={PAYMENT_URL} target="_blank" rel="noopener noreferrer">
                  <CreditCard className="mr-2 size-4" aria-hidden="true" />
                  {t('onboarding.plan.pay_now')}
                </a>
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => checkAgain.mutate()}
                loading={checkAgain.isPending}
              >
                {t('onboarding.plan.check_again')}
              </Button>
              {stillPending && (
                <p role="status" className="text-sm text-text-muted">
                  {t('onboarding.plan.still_pending')}
                </p>
              )}
              <Button
                variant="link"
                className="w-full"
                onClick={() => {
                  setAwaitingPayment(null);
                  setStillPending(false);
                }}
              >
                {t('onboarding.plan.change_plan')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface-page">
      <PageHeader title={t('onboarding.plan.title')} subtitle={t('onboarding.plan.subtitle')} />
      <div className="mx-auto max-w-4xl px-4 py-8">
        {state?.onboarding && (
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
            {t('onboarding.step', { current: 3, total: ONBOARDING_STEPS })}
          </p>
        )}
        {trialRunning && (
          <div className="mb-6 flex flex-col gap-3 rounded border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-text-muted">{t('onboarding.plan.trial_note')}</p>
            <Button asChild variant="secondary" size="sm">
              <Link to={next}>{t('onboarding.plan.continue_trial')}</Link>
            </Button>
          </div>
        )}
        {plans.isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="space-y-3 p-6">
                  <div className="h-6 w-1/3 rounded bg-surface-muted" />
                  <div className="h-4 w-1/2 rounded bg-surface-muted" />
                  <div className="h-4 w-1/4 rounded bg-surface-muted" />
                  <div className="mt-4 h-8 w-full rounded bg-surface-muted" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : plans.isError ? (
          <ErrorState
            title={t('onboarding.plan.load_error')}
            onRetry={() => void plans.refetch()}
            retrying={plans.isFetching}
          />
        ) : (plans.data ?? []).length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <p className="text-text-muted">{t('onboarding.plan.no_plans')}</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(plans.data ?? []).map((plan) => {
              const isCurrent = currentPlanId === plan.id;
              const isPending = select.isPending && select.variables?.id === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col transition-all',
                    isCurrent
                      ? 'border-primary ring-2 ring-primary'
                      : 'border-border hover:border-primary/50 hover:shadow-card',
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-h3">{plan.name}</CardTitle>
                    {isCurrent && <Badge tone="primary">{t('onboarding.plan.current')}</Badge>}
                  </CardHeader>
                  <CardBody className="flex flex-1 flex-col p-6">
                    <p className="mb-4 text-sm text-text-muted">
                      <span className="tabular text-3xl font-bold">{formatTzs(plan.price_tzs)}</span>{' '}
                      <span className="text-base">{t('onboarding.plan.per_month')}</span>
                    </p>
                    <ul className="mb-6 flex-1 space-y-3 text-sm">
                      {plan.limits &&
                        Object.entries(plan.limits)
                          .filter(([, value]) => value != null)
                          .map(([key, value]) => (
                            <li key={key} className="flex items-center gap-2">
                              <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                              <span className="capitalize">
                                {key.replace(/_/g, ' ')}: <span className="font-medium">{String(value)}</span>
                              </span>
                            </li>
                          ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={isCurrent ? 'secondary' : 'primary'}
                      onClick={() => select.mutate(plan)}
                      loading={isPending}
                      disabled={select.isPending}
                    >
                      {t('onboarding.plan.select')}
                    </Button>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NavigateToSignup() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page px-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-4 py-12 text-center">
          <h2 className="text-h2">{t('onboarding.plan.sign_in_required')}</h2>
          <p className="text-text-muted">{t('onboarding.plan.sign_in_body')}</p>
          <Button asChild>
            <Link to="/signup">{t('onboarding.plan.go_signup')}</Link>
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
