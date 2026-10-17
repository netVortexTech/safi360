import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Calendar,
  CheckCircle2,
  Plus,
  Ticket,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '../tickets/hooks';
import { useCurrentTenant } from '@/lib/tenant';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SourceChip } from '@/components/shared/SourceChip';
import { TicketChip } from '@/components/shared/TicketChip';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatDay, formatTime } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { cn } from '@/lib/utils';

export function OpsDashboard() {
  const { t } = useTranslation();
  const { data: tenant } = useCurrentTenant();
  const { data, isLoading, error } = useDashboard();

  const kpis = data?.kpis;
  const needsAction = useMemo(() => data?.needs_action ?? [], [data]);
  const recentTickets = useMemo(() => data?.recent_tickets ?? [], [data]);
  const bySource = useMemo(() => data?.by_source ?? [], [data]);

  const maxSourceCount = useMemo(() => Math.max(...bySource.map((s) => s.count), 1), [bySource]);

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertTriangle aria-hidden="true" />}
        title={t('errors.generic_title')}
        description={t('errors.generic_body')}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('nav.overview')}
        title={t('ops.dashboard_title')}
        subtitle={t('ops.dashboard_subtitle', {
          date: formatDay(new Date(), 'en'),
        })}
        actions={
          <Button asChild>
            <Link to="/ops/bookings/new">
              <Plus aria-hidden="true" />
              {t('nav.create_booking')}
            </Link>
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" role="list" aria-label="Key metrics">
        <KpiCard
          icon={<Calendar className="size-[18px]" aria-hidden="true" />}
          label={t('ops.kpi.todays_jobs')}
          value={String(kpis?.todays_jobs ?? 0)}
          tone="primary"
        />
        <KpiCard
          icon={<TrendingUp className="size-[18px]" aria-hidden="true" />}
          label={t('ops.kpi.booked_value')}
          value={formatTzs(kpis?.booked_value_tzs ?? 0)}
          tone="info"
        />
        <KpiCard
          icon={<Banknote className="size-[18px]" aria-hidden="true" />}
          label={t('ops.kpi.collected')}
          value={formatTzs(kpis?.collected_tzs ?? 0)}
          tone="success"
        />
        <KpiCard
          icon={<AlertTriangle className="size-[18px]" aria-hidden="true" />}
          label={t('ops.kpi.needs_action')}
          value={String(kpis?.needs_action ?? 0)}
          tone="warning"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Needs Your Action */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('ops.needs_action')}</CardTitle>
          </CardHeader>
          <CardBody className="p-3 sm:p-4">
            {needsAction.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-success-tint text-success">
                  <CheckCircle2 className="size-6" aria-hidden="true" />
                </span>
                <p className="text-body text-text-muted">{t('ops.all_clear')}</p>
              </div>
            ) : (
              <ul className="space-y-1.5" data-testid="needs-action-list">
                {needsAction.map((item, i) => (
                  <li
                    key={`${item.booking_id}-${i}`}
                    className="group flex items-center gap-3 rounded-lg border border-transparent p-3 transition-colors hover:border-border hover:bg-surface-muted/60"
                  >
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        item.priority === 'high' ? 'bg-error' : 'bg-amber',
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <TicketChip
                          ticketRef={item.ticket_ref}
                          to={`/ops/tickets/${item.booking_id}`}
                          size="sm"
                        />
                        <StatusBadge status={item.status} />
                      </div>
                      <p className="mt-1 truncate text-sm text-text-muted">
                        {item.customer_name} — {item.reason}
                      </p>
                    </div>
                    <Link
                      to={`/ops/tickets/${item.booking_id}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-light"
                    >
                      {t('common.view')}
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {/* Bookings by Source */}
        <Card>
          <CardHeader>
            <CardTitle>{t('ops.bookings_by_source')}</CardTitle>
          </CardHeader>
          <CardBody>
            {bySource.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-subtle">{t('ops.no_bookings_yet')}</p>
            ) : (
              <ul className="space-y-3.5" data-testid="source-chart">
                {bySource.map((s) => (
                  <li key={s.source}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <SourceChip source={s.source} />
                      <span className="tabular font-medium text-text">{s.count}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-premium"
                        style={{ width: `${(s.count / maxSourceCount) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Booked vs Collected */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ops.booked_vs_collected')}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <MoneyBlock label={t('ops.booked_value')} value={formatTzs(kpis?.booked_value_tzs ?? 0)} />
            <MoneyBlock
              label={t('ops.collected')}
              value={formatTzs(kpis?.collected_tzs ?? 0)}
              tone="text-success"
            />
            <MoneyBlock
              label={t('ops.pending')}
              value={formatTzs(kpis?.pending_tzs ?? 0)}
              tone="text-warning"
            />
          </div>
        </CardBody>
      </Card>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ops.recent_tickets')}</CardTitle>
          <Link
            to="/ops/tickets"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t('ops.view_all_tickets')}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {recentTickets.length === 0 ? (
            <EmptyState
              icon={<Ticket aria-hidden="true" />}
              title={t('empty.tickets_title')}
              description={t('empty.tickets_body')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-caption uppercase tracking-eyebrow text-text-subtle">
                    <th className="px-5 py-3 font-medium">{t('ops.col.ticket')}</th>
                    <th className="px-4 py-3 font-medium">{t('ops.col.customer')}</th>
                    <th className="px-4 py-3 font-medium">{t('ops.col.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('ops.col.when')}</th>
                    <th className="px-4 py-3 font-medium">{t('ops.col.source')}</th>
                    <th className="px-5 py-3 text-right font-medium">{t('ops.col.total')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentTickets.map((ticket) => (
                    <tr key={ticket.id} className="transition-colors hover:bg-surface-muted/60">
                      <td className="px-5 py-3.5">
                        <TicketChip
                          ticketRef={ticket.ticket_ref}
                          to={`/ops/tickets/${ticket.id}`}
                          size="sm"
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-text">{ticket.customer_name}</div>
                        <div className="tabular text-caption text-text-subtle">{ticket.customer_phone}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="px-4 py-3.5 text-text-muted">
                        {ticket.scheduled_start
                          ? `${formatDay(ticket.scheduled_start, 'en')}, ${formatTime(ticket.scheduled_start, 'en')}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <SourceChip source={ticket.source} />
                      </td>
                      <td className="tabular px-5 py-3.5 text-right font-semibold text-text">
                        {formatTzs(ticket.total_tzs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* First Day Setup Checklist */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ops.setup_checklist')}</CardTitle>
        </CardHeader>
        <CardBody>
          <SetupChecklist tenant={tenant} />
        </CardBody>
      </Card>
    </div>
  );
}

function MoneyBlock({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-5 py-5 text-center sm:text-left">
      <p className="text-caption uppercase tracking-eyebrow text-text-subtle">{label}</p>
      <p className={cn('tabular mt-1.5 text-h1 text-text', tone)}>{value}</p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'warning' | 'info';
}) {
  const tones = {
    primary: 'bg-primary-light text-primary',
    success: 'bg-success-tint text-success',
    warning: 'bg-warning-tint text-warning',
    info: 'bg-info-tint text-info',
  };
  return (
    <Card interactive role="listitem">
      <CardBody className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-caption uppercase tracking-eyebrow text-text-subtle">{label}</p>
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}>
            {icon}
          </span>
        </div>
        <p className="tabular mt-3 text-h1 text-text">{value}</p>
      </CardBody>
    </Card>
  );
}

function SetupChecklist({ tenant }: { tenant: { settings?: Record<string, unknown> } | undefined }) {
  const { t } = useTranslation();
  const settings = tenant?.settings ?? {};

  const items = [
    {
      key: 'services',
      label: t('ops.checklist.services'),
      done: true, // will be wired to real data later
      to: '/ops/services',
    },
    {
      key: 'zones',
      label: t('ops.checklist.zones'),
      done: true,
      to: '/ops/services/areas',
    },
    {
      key: 'staff',
      label: t('ops.checklist.staff'),
      done: true,
      to: '/ops/staff',
    },
    {
      key: 'working_hours',
      label: t('ops.checklist.working_hours'),
      done: !!(settings.working_hours && Object.keys(settings.working_hours).length > 0),
      to: '/ops/settings',
    },
    {
      key: 'first_booking',
      label: t('ops.checklist.first_booking'),
      done: false,
      to: '/ops/bookings/new',
    },
  ];

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            to={item.to}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-surface-muted/60"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                item.done ? 'border-success bg-success text-white' : 'border-border',
              )}
              aria-hidden="true"
            >
              {item.done && <CheckCircle2 className="size-3" />}
            </span>
            <span className={item.done ? 'text-text-subtle line-through' : 'text-text'}>{item.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default OpsDashboard;
