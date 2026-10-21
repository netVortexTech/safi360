import { useEffect } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSubscriptionStatus } from '@/lib/subscription';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { AlertCircle, Clock, CreditCard, Lock } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

interface SubscriptionGateProps {
  /** Where to redirect if user needs to select a plan */
  onboardingPath?: string;
  /** Children to render when access is granted */
  children?: React.ReactNode;
}

/**
 * Wrapper that checks subscription status and:
 * - Allows access if ACTIVE with plan
 * - Shows trial banner if TRIAL and not expired
 * - Redirects to onboarding if TRIAL expired or no plan selected
 * - Shows blocked UI if SUSPENDED/PAST_DUE
 */
export function SubscriptionGate({
  onboardingPath = '/onboarding/plan',
  children,
}: SubscriptionGateProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { status, isLoading, refetch } = useSubscriptionStatus();

  // Refetch on route change to catch status changes
  useEffect(() => {
    refetch();
  }, [location.pathname, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface-page" aria-busy="true">
        <div className="animate-pulse text-text-muted">{t('common.loading')}</div>
      </div>
    );
  }

  if (!status) {
    return <Navigate to={onboardingPath} replace state={{ from: location.pathname }} />;
  }

  // No tenant at all - redirect to signup
  if (status.status === 'NO_TENANT') {
    return <Navigate to="/signup" replace state={{ from: location.pathname }} />;
  }

  // Trial expired - redirect to plan selection with payment link info
  if (status.status === 'TRIAL' && status.isTrialExpired) {
    return (
      <SubscriptionExpiredView
        paymentUrl={status.paymentUrl}
        onboardingPath={onboardingPath}
        from={location.pathname}
      />
    );
  }

  // Active but no plan selected - redirect to plan selection
  if (status.status === 'ACTIVE' && !status.planId) {
    return <Navigate to={onboardingPath} replace state={{ from: location.pathname }} />;
  }

  // Suspended or past due - show blocked UI with payment link
  if (status.status === 'SUSPENDED' || status.status === 'PAST_DUE') {
    return (
      <SubscriptionBlockedView
        status={status.status}
        paymentUrl={status.paymentUrl}
        onboardingPath={onboardingPath}
        from={location.pathname}
      />
    );
  }

  // Trial active - show banner but allow access
  if (status.status === 'TRIAL' && !status.isTrialExpired) {
    return (
      <div className="min-h-dvh bg-surface-page">
        <TrialBanner daysRemaining={status.daysRemaining ?? 0} onboardingPath={onboardingPath} />
        {children ?? <Outlet />}
      </div>
    );
  }

  // Active with plan - full access
  return children ?? <Outlet />;
}

function TrialBanner({ daysRemaining, onboardingPath }: { daysRemaining: number; onboardingPath: string }) {
  const { t } = useTranslation();
  const isLastDay = daysRemaining <= 1;

  return (
    <div
      className={cn(
        'border-b border-amber/30 bg-amber/5 px-4 py-2',
        isLastDay && 'bg-amber/10 border-amber/50',
      )}
      role="alert"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="size-5 text-amber" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-foreground">
              {t('subscription.trial_banner_title', { days: daysRemaining })}
            </p>
            <p className="text-xs text-amber-foreground/80">
              {t('subscription.trial_banner_body')}
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link to={onboardingPath}>{t('subscription.trial_banner_cta')}</Link>
        </Button>
      </div>
    </div>
  );
}

function SubscriptionExpiredView({
  paymentUrl,
  onboardingPath,
  from,
}: {
  paymentUrl: string;
  onboardingPath: string;
  from: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-page px-4">
      <Card className="w-full max-w-md">
        <CardBody className="py-10 px-6 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <AlertCircle className="size-8 text-error" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-h2">{t('subscription.expired_title')}</h2>
            <p className="mt-2 text-text-muted">{t('subscription.expired_body')}</p>
          </div>
          <div className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <Link to={onboardingPath} state={{ from }}>
                {t('subscription.expired_cta_plan')}
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full" size="lg">
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                <CreditCard className="mr-2 size-4" aria-hidden="true" />
                {t('subscription.expired_cta_payment')}
              </a>
            </Button>
          </div>
          <p className="text-xs text-text-subtle">
            {t('subscription.expired_note', { url: paymentUrl })}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function SubscriptionBlockedView({
  status,
  paymentUrl,
  onboardingPath,
  from,
}: {
  status: 'SUSPENDED' | 'PAST_DUE';
  paymentUrl: string;
  onboardingPath: string;
  from: string;
}) {
  const { t } = useTranslation();
  const isSuspended = status === 'SUSPENDED';

  return (
    <div className="min-h-dvh flex items-center justify-center bg-surface-page px-4">
      <Card className="w-full max-w-md">
        <CardBody className="py-10 px-6 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            <Lock className="size-8 text-error" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-h2">{isSuspended ? t('subscription.suspended_title') : t('subscription.past_due_title')}</h2>
            <p className="mt-2 text-text-muted">
              {isSuspended ? t('subscription.suspended_body') : t('subscription.past_due_body')}
            </p>
          </div>
          <div className="space-y-3">
            <Button asChild className="w-full" size="lg">
              <Link to={onboardingPath} state={{ from }}>
                {t('subscription.blocked_cta_plan')}
              </Link>
            </Button>
            <Button asChild variant="ghost" className="w-full" size="lg">
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                <CreditCard className="mr-2 size-4" aria-hidden="true" />
                {t('subscription.blocked_cta_payment')}
              </a>
            </Button>
          </div>
          <p className="text-xs text-text-subtle">
            {t('subscription.blocked_note', { url: paymentUrl })}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

