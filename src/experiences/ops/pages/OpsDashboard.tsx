import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Banknote, Calendar, CheckCircle2, Plus, Ticket, TrendingUp } from 'lucide-react';
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
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
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
          icon={<Calendar className="size-5" aria-hidden="true" />}
          label={t('ops.kpi.todays_jobs')}
          value={String(kpis?.todays_jobs ?? 0)}
          tone="primary"
        />
        <KpiCard
          icon={<TrendingUp className="size-5" aria-hidden="true" />}
          label={t('ops.kpi.booked_value')}
          value={formatTzs(kpis?.booked_value_tzs ?? 0)}
          tone="info"
        />
        <KpiCard
          icon={<Banknote className="size-5" aria-hidden="true" />}
          label={t('ops.kpi.collected')}
          value={formatTzs(kpis?.collected_tzs ?? 0)}
          tone="success"
        />
        <KpiCard
          icon={<AlertTriangle className="size-5" aria-hidden="true" />}
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
          <CardBody>
            {needsAction.length === 0 ? (
              <div className="py-8 text-center text-text-subtle">
                <CheckCircle2 className="mx-auto mb-2 size-8 text-success" aria-hidden="true" />
                <p className="text-body">{t('ops.all_clear')}</p>
              </div>
            ) : (
              <ul className="space-y-3" data-testid="needs-action-list">
                {needsAction.map((item, i) => (
                  <li
                    key={`${item.booking_id}-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div
                      className={`size-2 shrink-0 rounded-full ${
                        item.priority === 'high' ? 'bg-error' : 'bg-warning'
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
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
                      className="shrink-0 text-sm text-primary hover:underline"
                    >
                      {t('common.view')}
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
              <p className="py-4 text-center text-sm text-text-subtle">{t('ops.no_bookings_yet')}</p>
            ) : (
              <ul className="space-y-3" data-testid="source-chart">
                {bySource.map((s) => (
                  <li key={s.source}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <SourceChip source={s.source} />
                      <span className="tabular text-text-muted">{s.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
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
        <CardBody>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-caption text-text-subtle">{t('ops.booked_value')}</p>
              <p className="tabular mt-1 text-h2 text-text">{formatTzs(kpis?.booked_value_tzs ?? 0)}</p>
            </div>
            <div>
              <p className="text-caption text-text-subtle">{t('ops.collected')}</p>
              <p className="tabular mt-1 text-h2 text-success">{formatTzs(kpis?.collected_tzs ?? 0)}</p>
            </div>
            <div>
              <p className="text-caption text-text-subtle">{t('ops.pending')}</p>
              <p className="tabular mt-1 text-h2 text-warning">{formatTzs(kpis?.pending_tzs ?? 0)}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Recent Tickets */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ops.recent_tickets')}</CardTitle>
        </CardHeader>
        <CardBody>
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
                  <tr className="border-b border-border text-left text-text-subtle">
                    <th className="pb-2 pr-4 font-medium">{t('ops.col.ticket')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('ops.col.customer')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('ops.col.status')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('ops.col.when')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('ops.col.source')}</th>
                    <th className="pb-2 text-right font-medium">{t('ops.col.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map((ticket) => (
                    <tr key={ticket.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4">
                        <TicketChip
                          ticketRef={ticket.ticket_ref}
                          to={`/ops/tickets/${ticket.id}`}
                          size="sm"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-text">{ticket.customer_name}</div>
                        <div className="text-xs text-text-subtle">{ticket.customer_phone}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={ticket.status} />
                      </td>
                      <td className="py-3 pr-4 text-text-subtle">
                        {ticket.scheduled_start
                          ? `${formatDay(ticket.scheduled_start, 'en')}, ${formatTime(ticket.scheduled_start, 'en')}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <SourceChip source={ticket.source} />
                      </td>
                      <td className="tabular py-3 text-right font-medium">{formatTzs(ticket.total_tzs)}</td>
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
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    info: 'text-info',
  };
  return (
    <Card role="listitem">
      <CardBody className="p-4">
        <div className={`mb-2 ${tones[tone]}`}>{icon}</div>
        <p className="text-caption text-text-subtle">{label}</p>
        <p className="tabular mt-1 text-h2 text-text">{value}</p>
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
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-3">
          <div
            className={`flex size-5 items-center justify-center rounded-full border-2 ${
              item.done ? 'border-success bg-success text-white' : 'border-border'
            }`}
            aria-hidden="true"
          >
            {item.done && <CheckCircle2 className="size-3" />}
          </div>
          <Link
            to={item.to}
            className={`text-sm ${item.done ? 'text-text-muted line-through' : 'text-text hover:underline'}`}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default OpsDashboard;
