import { Plus, UserCheck, UserPlus } from '@/components/ui/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { DataView, type DataColumn } from '@/components/shared/DataView';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';
import { formatTzs } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { useZones } from '../../catalog/hooks';
import type { StaffRow } from '../api';
import { useCreateCleaner, useStaff } from '../hooks';
import { QuickAddCleanerDialog } from '../QuickAddCleanerDialog';

export default function StaffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const staff = useStaff();
  const zones = useZones();
  const { toast } = useToast();
  const createCleaner = useCreateCleaner();
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const zoneName = (id: string | null) =>
    zones.data?.find((z) => z.id === id)?.name ?? t('common.not_available');
  const pay = (s: StaffRow) =>
    s.pay_type && s.pay_rate_tzs != null
      ? `${formatTzs(s.pay_rate_tzs)} · ${t(`staff.pay_type.${s.pay_type}`)}`
      : t('common.not_available');

  const columns: DataColumn<StaffRow>[] = [
    {
      key: 'name',
      header: t('staff.col.name'),
      cell: (s) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-text">{s.display_name}</span>
          {s.is_team_lead && <Badge tone="navy">{t('staff.team_lead')}</Badge>}
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('phone.label'),
      cell: (s) => (
        <span className="tabular">
          {s.phone_e164 ? formatPhone(s.phone_e164) : t('common.not_available')}
        </span>
      ),
    },
    {
      key: 'skills',
      header: t('staff.col.skills'),
      cell: (s) => t('staff.skills_count', { count: s.skills.length }),
      align: 'right',
    },
    { key: 'zone', header: t('staff.col.home_zone'), cell: (s) => zoneName(s.home_zone_id) },
    { key: 'pay', header: t('staff.col.pay'), cell: pay },
    {
      key: 'status',
      header: t('catalog.col.status'),
      cell: (s) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={s.active ? 'success' : 'neutral'}>
            {t(s.active ? 'common.active' : 'common.inactive')}
          </Badge>
          <Badge tone={s.user_id ? 'info' : 'outline'}>
            {t(s.user_id ? 'staff.linked' : 'staff.not_linked')}
          </Badge>
        </div>
      ),
    },
  ];

  const state = staff.isPending
    ? 'loading'
    : staff.isError
      ? 'error'
      : (staff.data?.length ?? 0) === 0
        ? 'empty'
        : 'data';

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: t('nav.team') }, { label: t('nav.staff') }]}
        title={t('nav.staff')}
        subtitle={t('staff.subtitle')}
        actions={
          <>
            <Button variant="secondary" asChild>
              <Link to="/ops/staff/new">
                <Plus aria-hidden="true" />
                {t('staff.add')}
              </Link>
            </Button>
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden="true" />
              {t('staff.quick_add')}
            </Button>
          </>
        }
      />
      <DataView
        state={state}
        rows={staff.data ?? []}
        columns={columns}
        rowKey={(s) => s.id}
        caption={t('nav.staff')}
        onRowClick={(s) => void navigate(`/ops/staff/${s.id}`)}
        renderCard={(s) => (
          <Link
            to={`/ops/staff/${s.id}`}
            className="block rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium text-text">
                  {s.display_name}
                  {s.is_team_lead && <Badge tone="navy">{t('staff.team_lead')}</Badge>}
                </div>
                <div className="tabular text-xs text-text-subtle">
                  {s.phone_e164 ? formatPhone(s.phone_e164) : t('common.not_available')}
                </div>
              </div>
              <Badge tone={s.active ? 'success' : 'neutral'}>
                {t(s.active ? 'common.active' : 'common.inactive')}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-muted">
              <Badge tone={s.user_id ? 'info' : 'outline'}>
                {t(s.user_id ? 'staff.linked' : 'staff.not_linked')}
              </Badge>
              <span>
                {t('staff.skills_count', { count: s.skills.length })} · {zoneName(s.home_zone_id)}
              </span>
            </div>
          </Link>
        )}
        empty={
          <EmptyState
            icon={<UserCheck />}
            title={t('staff.empty_title')}
            description={t('staff.empty_body')}
            actions={
              <Button asChild>
                <Link to="/ops/staff/new">
                  <Plus aria-hidden="true" />
                  {t('staff.add')}
                </Link>
              </Button>
            }
          />
        }
        error={
          <ErrorState
            description={t(errorKey(staff.error))}
            onRetry={() => void staff.refetch()}
            retrying={staff.isFetching}
          />
        }
      />
      <QuickAddCleanerDialog
        open={adding}
        busy={createCleaner.isPending}
        error={addError}
        onOpenChange={(o) => {
          setAdding(o);
          if (!o) setAddError(null);
        }}
        onSubmit={(values) => {
          setAddError(null);
          createCleaner.mutate(values, {
            onSuccess: (result) => {
              toast({
                title: t(result.linked ? 'staff.quick_added_linked' : 'staff.quick_added', {
                  name: result.staff.display_name,
                }),
              });
              setAdding(false);
            },
            onError: (e) => setAddError(t(errorKey(e))),
          });
        }}
      />
    </>
  );
}
