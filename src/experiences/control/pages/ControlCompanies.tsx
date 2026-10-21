import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2 } from '@/components/ui/icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDay } from '@/lib/dates';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string;
  created_at: string;
}

interface PlanRow {
  id: string;
  name: string;
}

const STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;

function statusTone(status: string): 'info' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'TRIAL':
      return 'info';
    case 'ACTIVE':
      return 'success';
    case 'PAST_DUE':
      return 'warning';
    case 'SUSPENDED':
      return 'error';
    default:
      return 'neutral';
  }
}

export default function ControlCompanies() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  const tenantsQuery = useQuery({
    queryKey: ['control', 'tenants', 'list'],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, plan_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const plansQuery = useQuery({
    queryKey: ['control', 'plans', 'list'],
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase.from('plans').select('id, name').order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const planName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of plansQuery.data ?? []) map.set(p.id, p.name);
    return (id: string | null) => (id ? (map.get(id) ?? id) : '—');
  }, [plansQuery.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (tenantsQuery.data ?? []).filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (planFilter && row.plan_id !== planFilter) return false;
      if (needle && !`${row.name} ${row.slug}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tenantsQuery.data, search, statusFilter, planFilter]);

  if (!auth.claims.is_super_admin) {
    return <p className="p-4 text-center text-text-muted">{t('control.companies.not_authorized')}</p>;
  }

  const loading = tenantsQuery.isLoading;
  const error = tenantsQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader title={t('control.companies.title')} subtitle={t('control.companies.subtitle')} />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              type="search"
              placeholder={t('control.companies.search_placeholder')}
              aria-label={t('control.companies.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('control.companies.filter_status')}
            >
              <option value="">{t('control.companies.all_statuses')}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label={t('control.companies.filter_plan')}
            >
              <option value="">{t('control.companies.all_plans')}</option>
              {(plansQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : error ? (
            <ErrorState onRetry={() => void tenantsQuery.refetch()} retrying={tenantsQuery.isFetching} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title={t('control.companies.empty_title')}
              description={t('control.companies.empty_body')}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.companies.col_name')}</TH>
                  <TH>{t('control.companies.col_slug')}</TH>
                  <TH>{t('control.companies.col_plan')}</TH>
                  <TH>{t('control.companies.col_status')}</TH>
                  <TH>{t('control.companies.col_created')}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        to={`/control/companies/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TD>
                    <TD className="text-text-subtle">{row.slug}</TD>
                    <TD className="text-text-subtle">{planName(row.plan_id)}</TD>
                    <TD>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </TD>
                    <TD className="text-xs text-text-subtle">{formatDay(row.created_at, 'en')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
