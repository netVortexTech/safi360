import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { RouteLoading } from '@/app/RouteLoading';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Check } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth';
import { asError } from '@/lib/errors';
import { formatTzs } from '@/lib/money';
import { subscriptionKeys } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
  limits: Record<string, unknown> | null;
}

/**
 * The owner picks a plan. select_plan() (migration 0034) records it server-side; it never
 * changes the tenant status, so the trial keeps running and activation stays with the
 * platform (payment callback or super admin).
 */
export default function OnboardingPlan() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from;
  const next = from && from.startsWith('/') ? from : '/ops';

  const plans = useQuery({
    queryKey: ['plans', 'active'],
    enabled: auth.status === 'signed_in',
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

  const select = useMutation({
    mutationFn: async (planId: string) => {
      const res: { error: unknown } = await supabase.rpc('select_plan', { p_plan_id: planId });
      if (res.error) throw asError(res.error);
      // Straight after signup the token may still lack the tenant claims the shells need.
      await supabase.auth.refreshSession();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      toast({ title: t('onboarding.plan.success') });
      navigate(next, { replace: true });
    },
    onError: () => toast({ title: t('onboarding.plan.error'), tone: 'error' }),
  });

  if (auth.status === 'loading') return <RouteLoading />;
  if (auth.status === 'signed_out') return <NavigateToSignup />;

  return (
    <div className="min-h-dvh bg-surface-page">
      <PageHeader title={t('onboarding.plan.title')} subtitle={t('onboarding.plan.subtitle')} />
      <div className="mx-auto max-w-4xl px-4 py-8">
        {plans.isLoading ? (
          <div className="space-y-6" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="flex gap-4 p-6">
                  <div className="flex-1 space-y-3">
                    <div className="h-6 w-1/3 rounded bg-surface-muted" />
                    <div className="h-4 w-1/2 rounded bg-surface-muted" />
                    <div className="h-4 w-1/4 rounded bg-surface-muted" />
                    <div className="mt-4 h-8 w-full rounded bg-surface-muted" />
                  </div>
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
              <Button asChild className="mt-4">
                <Link to="/ops/login">{t('onboarding.plan.contact_support')}</Link>
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(plans.data ?? []).map((plan) => {
              const isSelected = selectedPlan === plan.id;
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    'relative flex flex-col transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 ring-2 ring-primary'
                      : 'border-border hover:border-primary/50 hover:shadow-card',
                  )}
                >
                  <CardHeader>
                    <CardTitle className="text-h3">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardBody className="flex flex-1 flex-col p-6">
                    <p className="mb-4 text-sm text-text-muted">
                      <span className="tabular text-3xl font-bold">{formatTzs(plan.price_tzs)}</span>{' '}
                      <span className="text-base">{t('onboarding.plan.per_month')}</span>
                    </p>
                    <ul className="mb-6 flex-1 space-y-3 text-sm">
                      {plan.limits &&
                        Object.entries(plan.limits).map(([key, value]) => (
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
                      variant={isSelected ? 'primary' : 'secondary'}
                      onClick={() => setSelectedPlan(plan.id)}
                      disabled={select.isPending}
                    >
                      {isSelected ? t('onboarding.plan.selecting') : t('onboarding.plan.select')}
                    </Button>
                    <Button
                      className="mt-3 w-full"
                      variant="ghost"
                      onClick={() => select.mutate(plan.id)}
                      loading={select.isPending && isSelected}
                      disabled={!isSelected || select.isPending}
                    >
                      {t('onboarding.plan.confirm')}
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
