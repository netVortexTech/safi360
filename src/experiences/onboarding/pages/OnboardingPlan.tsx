import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatTzs } from '@/lib/money';
import { Check } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
  limits: Record<string, unknown> | null;
}

export default function OnboardingPlan() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch active plans
  const fetchPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, price_tzs, limits')
        .eq('active', true)
        .order('price_tzs');
      if (error) throw error;
      setPlans(data ?? []);
    } catch (err) {
      toast({ title: t('onboarding.plan.load_error'), tone: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const selectPlan = async (planId: string) => {
    if (!auth.userId) {
      navigate('/signup', { replace: true });
      return;
    }
    setSubmitting(true);
    try {
      // Get tenant ID from user's membership
      const { data: membership, error: memError } = await supabase
        .from('memberships')
        .select('tenant_id')
        .eq('user_id', auth.userId)
        .eq('active', true)
        .single();
      if (memError || !membership) throw new Error('No active membership');

      const { error } = await supabase
        .from('tenants')
        .update({ plan_id: planId, status: 'ACTIVE', trial_ends_at: null })
        .eq('id', membership.tenant_id);
      if (error) throw error;

      await supabase.auth.refreshSession();
      toast({ title: t('onboarding.plan.success') });
      navigate('/ops', { replace: true });
    } catch (err) {
      toast({ title: t('onboarding.plan.error'), tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  // Check if user is authenticated and has a tenant
  if (auth.status === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-page">
        <div className="animate-pulse text-text-muted">{t('common.loading')}</div>
      </div>
    );
  }

  if (auth.status === 'signed_out') {
    return <NavigateToSignup />;
  }

  // Load plans on mount
  if (loading) {
    fetchPlans();
  }

  return (
    <div className="min-h-dvh bg-surface-page">
      <PageHeader
        title={t('onboarding.plan.title')}
        subtitle={t('onboarding.plan.subtitle')}
      />
      <div className="mx-auto max-w-4xl px-4 py-8">
        {loading ? (
          <div className="space-y-6" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="flex gap-4 p-6">
                  <div className="flex-1 space-y-3">
                    <div className="h-6 w-1/3 bg-surface-muted rounded" />
                    <div className="h-4 w-1/2 bg-surface-muted rounded" />
                    <div className="h-4 w-1/4 bg-surface-muted rounded" />
                    <div className="h-8 w-full bg-surface-muted rounded mt-4" />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        ) : plans.length === 0 ? (
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
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  'relative flex flex-col transition-all',
                  selectedPlan === plan.id
                    ? 'ring-2 ring-primary border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:shadow-card',
                )}
              >
                <CardHeader>
                  <CardTitle className="text-h3">{plan.name}</CardTitle>
                </CardHeader>
                <CardBody className="flex flex-col flex-1 p-6">
                  <p className="text-sm text-text-muted mb-4">
                    <span className="tabular text-3xl font-bold">{formatTzs(plan.price_tzs)}</span>{' '}
                    <span className="text-base">{t('onboarding.plan.per_month')}</span>
                  </p>
                  <ul className="flex-1 space-y-3 text-sm mb-6">
                    {plan.limits && Object.entries(plan.limits).map(([key, value]) => (
                      <li key={key} className="flex items-center gap-2">
                        <Check className="size-4 text-success shrink-0" aria-hidden="true" />
                        <span className="capitalize">{key.replace(/_/g, ' ')}: <span className="font-medium">{String(value)}</span></span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={selectedPlan === plan.id ? 'primary' : 'secondary'}
                    onClick={() => setSelectedPlan(plan.id)}
                    loading={submitting && selectedPlan === plan.id}
                  >
                    {selectedPlan === plan.id ? t('onboarding.plan.selecting') : t('onboarding.plan.select')}
                  </Button>
                  <Button
                    className="mt-3 w-full"
                    variant="ghost"
                    onClick={() => selectPlan(plan.id)}
                    disabled={selectedPlan !== plan.id || submitting}
                  >
                    {t('onboarding.plan.confirm')}
                  </Button>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NavigateToSignup() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-page px-4">
      <Card className="w-full max-w-md">
        <CardBody className="py-12 text-center space-y-4">
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