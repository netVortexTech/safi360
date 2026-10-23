import { useTranslation } from 'react-i18next';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { RouteLoading } from '@/app/RouteLoading';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { AlertCircle, Clock, CreditCard, Lock } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { isOffline } from '@/lib/errors';
import { useSubscriptionStatus } from '@/lib/subscription';
import { cn } from '@/lib/utils';

interface SubscriptionGateProps {
  /** Where an owner goes to pick a plan. */
  onboardingPath?: string;
  /** Rendered when access is granted; defaults to the nested route. */
  children?: React.ReactNode;
}

/**
 * Wraps the ops and field shells and decides from the tenant's platform-managed columns:
 *  - visitors and accounts without a company pass straight through — the layout owns those
 *    cases (login redirect, "no company yet" screen);
 *  - TRIAL, not expired: render, with a countdown banner;
 *  - TRIAL expired, PAST_DUE, SUSPENDED: blocked screen with the payment link;
 *  - ACTIVE without a plan: send the owner to pick one;
 *  - ACTIVE with a plan: render.
 * Only an OWNER sees the "choose a plan" calls to action; employees cannot act on them.
 */
export function SubscriptionGate({ onboardingPath = '/onboarding/plan', children }: SubscriptionGateProps) {
  const auth = useAuth();
  const location = useLocation();
  const { status, isLoading, isFetching, error, refetch } = useSubscriptionStatus();
  const content = children ?? <Outlet />;
  const canChoosePlan = auth.claims.tenant_role === 'OWNER';

  if (auth.status === 'loading') return <RouteLoading />;
  if (auth.status !== 'signed_in' || auth.claims.tenant_id == null) return content;
  if (isLoading) return <RouteLoading />;
  if (error || !status) {
    return (
      <div className="min-h-dvh bg-surface-page p-4 md:p-8">
        <ErrorState
          className="mx-auto max-w-lg"
          offline={isOffline()}
          onRetry={refetch}
          retrying={isFetching}
        />
      </div>
    );
  }
  // The token still names a tenant the database no longer links to this user (revoked
  // membership, deleted company). The layout's own queries surface that; nothing to gate.
  if (status.status === 'NO_TENANT') return content;

  if (status.status === 'TRIAL' && status.isTrialExpired) {
    return (
      <SubscriptionExpiredView
        paymentUrl={status.paymentUrl}
        planPath={canChoosePlan ? onboardingPath : null}
        from={location.pathname}
      />
    );
  }
  if (status.status === 'SUSPENDED' || status.status === 'PAST_DUE') {
    return (
      <SubscriptionBlockedView
        status={status.status}
        paymentUrl={status.paymentUrl}
        planPath={canChoosePlan ? onboardingPath : null}
        from={location.pathname}
      />
    );
  }
  if (status.status === 'ACTIVE' && !status.planId && canChoosePlan) {
    return <Navigate to={onboardingPath} replace state={{ from: location.pathname }} />;
  }
  if (status.status === 'TRIAL') {
    return (
      <div className="min-h-dvh bg-surface-page">
        <TrialBanner
          daysRemaining={status.daysRemaining ?? 0}
          planPath={canChoosePlan ? onboardingPath : null}
        />
        {content}
      </div>
    );
  }
  return content;
}

function TrialBanner({ daysRemaining, planPath }: { daysRemaining: number; planPath: string | null }) {
  const { t } = useTranslation();
  const isLastDay = daysRemaining <= 1;

  return (
    <div
      className={cn(
        'border-b border-amber/30 bg-amber/5 px-4 py-2',
        isLastDay && 'border-amber/50 bg-amber/10',
      )}
      role="status"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clock className="size-5 text-amber" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-amber-foreground">
              {t('subscription.trial_banner_title', { days: daysRemaining })}
            </p>
            <p className="text-xs text-amber-foreground/80">{t('subscription.trial_banner_body')}</p>
          </div>
        </div>
        {planPath && (
          <Button asChild size="sm" variant="secondary">
            <Link to={planPath}>{t('subscription.trial_banner_cta')}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function BlockedCard({
  icon,
  title,
  body,
  planLabel,
  payLabel,
  note,
  paymentUrl,
  planPath,
  from,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  planLabel: string;
  payLabel: string;
  note: string;
  paymentUrl: string;
  planPath: string | null;
  from: string;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-page px-4">
      <Card className="w-full max-w-md">
        <CardBody className="space-y-6 px-6 py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-error/10">
            {icon}
          </div>
          <div>
            <h2 className="text-h2">{title}</h2>
            <p className="mt-2 text-text-muted">{body}</p>
          </div>
          <div className="space-y-3">
            {planPath && (
              <Button asChild className="w-full" size="lg">
                <Link to={planPath} state={{ from }}>
                  {planLabel}
                </Link>
              </Button>
            )}
            <Button asChild variant={planPath ? 'ghost' : 'primary'} className="w-full" size="lg">
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer">
                <CreditCard className="mr-2 size-4" aria-hidden="true" />
                {payLabel}
              </a>
            </Button>
          </div>
          <p className="text-xs text-text-subtle">{note}</p>
        </CardBody>
      </Card>
    </div>
  );
}

function SubscriptionExpiredView({
  paymentUrl,
  planPath,
  from,
}: {
  paymentUrl: string;
  planPath: string | null;
  from: string;
}) {
  const { t } = useTranslation();
  return (
    <BlockedCard
      icon={<AlertCircle className="size-8 text-error" aria-hidden="true" />}
      title={t('subscription.expired_title')}
      body={t('subscription.expired_body')}
      planLabel={t('subscription.expired_cta_plan')}
      payLabel={t('subscription.expired_cta_payment')}
      note={t('subscription.expired_note', { url: paymentUrl })}
      paymentUrl={paymentUrl}
      planPath={planPath}
      from={from}
    />
  );
}

function SubscriptionBlockedView({
  status,
  paymentUrl,
  planPath,
  from,
}: {
  status: 'SUSPENDED' | 'PAST_DUE';
  paymentUrl: string;
  planPath: string | null;
  from: string;
}) {
  const { t } = useTranslation();
  const suspended = status === 'SUSPENDED';
  return (
    <BlockedCard
      icon={<Lock className="size-8 text-error" aria-hidden="true" />}
      title={suspended ? t('subscription.suspended_title') : t('subscription.past_due_title')}
      body={suspended ? t('subscription.suspended_body') : t('subscription.past_due_body')}
      planLabel={t('subscription.blocked_cta_plan')}
      payLabel={t('subscription.blocked_cta_payment')}
      note={t('subscription.blocked_note', { url: paymentUrl })}
      paymentUrl={paymentUrl}
      planPath={planPath}
      from={from}
    />
  );
}
