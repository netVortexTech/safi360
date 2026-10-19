import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string;
  trial_ends_at: string | null;
}

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
}

export default function ControlSubscriptions() {
  const auth = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [changeTarget, setChangeTarget] = useState<TenantRow | null>(null);
  const [newPlanId, setNewPlanId] = useState('');
  const [sentIds, setSentIds] = useState<Record<string, boolean>>({});

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.subscriptions.forbidden')}
      </div>
    );
  }

  return (
    <SubscriptionsBody
      search={search}
      setSearch={setSearch}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      planFilter={planFilter}
      setPlanFilter={setPlanFilter}
      changeTarget={changeTarget}
      setChangeTarget={setChangeTarget}
      newPlanId={newPlanId}
      setNewPlanId={setNewPlanId}
      sentIds={sentIds}
      setSentIds={setSentIds}
      locale={i18n.language === 'sw' ? 'sw' : 'en'}
      queryClient={queryClient}
    />
  );
}

function SubscriptionsBody(props: {
  search: string;
  setSearch: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  planFilter: string;
  setPlanFilter: (v: string) => void;
  changeTarget: TenantRow | null;
  setChangeTarget: (v: TenantRow | null) => void;
  newPlanId: string;
  setNewPlanId: (v: string) => void;
  sentIds: Record<string, boolean>;
  setSentIds: (v: Record<string, boolean>) => void;
  locale: 'en' | 'sw';
  queryClient: QueryClient;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    planFilter,
    setPlanFilter,
    changeTarget,
    setChangeTarget,
    newPlanId,
    setNewPlanId,
    sentIds,
    setSentIds,
    locale,
    queryClient,
  } = props;

  const tenantsQuery = useQuery<TenantRow[]>({
    queryKey: ['control', 'tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id,name,slug,plan_id,status,trial_ends_at');
      if (error) throw error;
      return data ?? [];
    },
  });

  const plansQuery = useQuery<PlanRow[]>({
    queryKey: ['control', 'plans-lite'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('id,name,price_tzs');
      if (error) throw error;
      return data ?? [];
    },
  });

  const changePlan = useMutation({
    mutationFn: async ({ tenantId, planId }: { tenantId: string; planId: string }) => {
      const { error } = await supabase.from('tenants').update({ plan_id: planId }).eq('id', tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: t('control.toast_saved') });
      void queryClient.invalidateQueries({ queryKey: ['control', 'tenants'] });
      setChangeTarget(null);
    },
  });

  const tenants = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);
  const plansById = useMemo(() => {
    const map = new Map<string, PlanRow>();
    for (const p of plansQuery.data ?? []) map.set(p.id, p);
    return map;
  }, [plansQuery.data]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tenants.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (planFilter && row.plan_id !== planFilter) return false;
      if (needle && !`${row.name} ${row.slug}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [tenants, statusFilter, planFilter, search]);

  const loading = tenantsQuery.isLoading || plansQuery.isLoading;
  const queryError = tenantsQuery.error ?? plansQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader title={t('control.subscriptions.title')} subtitle={t('control.subscriptions.subtitle')} />
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder={t('control.subscriptions.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={t('control.subscriptions.search_placeholder')}
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('control.subscriptions.status')}
            >
              <option value="">{t('control.subscriptions.all_statuses')}</option>
              {['active', 'trialing', 'suspended', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              aria-label={t('control.subscriptions.plan')}
            >
              <option value="">{t('control.subscriptions.all_plans')}</option>
              {(plansQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {loading ? <Skeleton className="h-40 w-full" /> : null}
          {queryError ? (
            <ErrorState
              title={t('control.subscriptions.load_error')}
              description={String(queryError)}
              onRetry={() => {
                void tenantsQuery.refetch();
                void plansQuery.refetch();
              }}
            />
          ) : null}
          {!loading && !queryError && filtered.length === 0 ? (
            <EmptyState
              title={t('control.subscriptions.empty')}
              description={t('control.subscriptions.empty_hint')}
            />
          ) : null}
          {!loading && !queryError && filtered.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.subscriptions.company')}</TH>
                  <TH>{t('control.subscriptions.plan')}</TH>
                  <TH>{t('control.subscriptions.status')}</TH>
                  <TH>{t('control.subscriptions.amount')}</TH>
                  <TH>{t('control.subscriptions.trial_ends')}</TH>
                  <TH>
                    <span className="sr-only">{t('control.subscriptions.actions')}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row) => {
                  const plan = row.plan_id ? plansById.get(row.plan_id) : undefined;
                  return (
                    <TR key={row.id}>
                      <TD className="font-medium">{row.name}</TD>
                      <TD>{plan?.name ?? '-'}</TD>
                      <TD>
                        <Badge
                          tone={
                            row.status === 'active'
                              ? 'success'
                              : row.status === 'trialing'
                                ? 'info'
                                : 'warning'
                          }
                        >
                          {row.status}
                        </Badge>
                      </TD>
                      <TD className="tabular">{plan ? formatTzs(plan.price_tzs) : '-'}</TD>
                      <TD className="text-xs text-text-subtle">
                        {row.trial_ends_at ? formatDay(row.trial_ends_at, locale) : '-'}
                      </TD>
                      <TD>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setChangeTarget(row);
                              setNewPlanId(row.plan_id ?? '');
                            }}
                          >
                            {t('control.subscriptions.change_plan')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSentIds({ ...sentIds, [row.id]: true })}
                          >
                            {sentIds[row.id]
                              ? t('control.subscriptions.reminder_sent')
                              : t('control.subscriptions.send_reminder')}
                          </Button>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : null}
        </CardBody>
      </Card>

      <Dialog
        open={changeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setChangeTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('control.subscriptions.change_plan')}</DialogTitle>
          </DialogHeader>
          {changePlan.error ? <p className="text-sm text-error">{String(changePlan.error)}</p> : null}
          <Field id="change-plan" label={t('control.subscriptions.plan')} required>
            <Select id="change-plan" value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)}>
              <option value="">{t('control.subscriptions.select_plan')}</option>
              {(plansQuery.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatTzs(p.price_tzs)}
                </option>
              ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setChangeTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={!changeTarget || !newPlanId}
              loading={changePlan.isPending}
              onClick={() => {
                if (changeTarget && newPlanId) {
                  void changePlan.mutateAsync({ tenantId: changeTarget.id, planId: newPlanId });
                }
              }}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
