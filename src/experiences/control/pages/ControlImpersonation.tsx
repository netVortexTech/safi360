import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface ImpersonationSession {
  id: string;
  target_tenant_id: string;
  target_role: string;
  reason: string;
  created_at: string;
}

function isMissingTable(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return (err as { code?: string }).code === '42P01';
  }
  return String(err).includes('42P01');
}

const ROLES = ['OWNER', 'MANAGER', 'DISPATCHER'] as const;

export default function ControlImpersonation() {
  const auth = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sw' ? 'sw' : 'en';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [role, setRole] = useState<string>('OWNER');
  const [reason, setReason] = useState('');
  const [activeSession, setActiveSession] = useState<{ tenantName: string; role: string } | null>(null);
  const [localStarted, setLocalStarted] = useState(false);

  const tenantsQuery = useQuery<TenantOption[]>({
    queryKey: ['control', 'impersonation-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tenants').select('id,name,slug');
      if (error) throw error;
      return data ?? [];
    },
    enabled: auth.claims.is_super_admin,
  });

  const historyQuery = useQuery<{ rows: ImpersonationSession[]; missing: boolean }>({
    queryKey: ['control', 'impersonation-history'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('impersonation_sessions')
          .select('id,target_tenant_id,target_role,reason,created_at')
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        return { rows: data ?? [], missing: false };
      } catch (err) {
        if (isMissingTable(err)) return { rows: [], missing: true };
        throw err;
      }
    },
    enabled: auth.claims.is_super_admin,
  });

  const startMutation = useMutation({
    mutationFn: async (vars: { tenantId: string; targetRole: string; reason: string }) => {
      try {
        const { error } = await supabase.from('impersonation_sessions').insert({
          admin_user_id: auth.userId,
          target_tenant_id: vars.tenantId,
          target_role: vars.targetRole,
          reason: vars.reason,
        });
        if (error) throw error;
        return { persisted: true };
      } catch (err) {
        if (isMissingTable(err)) return { persisted: false };
        throw err;
      }
    },
    onSuccess: (_res, vars) => {
      const tenant = (tenantsQuery.data ?? []).find((x) => x.id === vars.tenantId);
      setActiveSession({ tenantName: tenant?.name ?? vars.tenantId, role: vars.targetRole });
      setLocalStarted(true);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['control', 'impersonation-history'] });
    },
  });

  const tenants = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = tenantsQuery.data ?? [];
    if (!needle) return all;
    return all.filter((x) => `${x.name} ${x.slug}`.toLowerCase().includes(needle));
  }, [tenantsQuery.data, search]);

  const canStart = selectedTenantId !== '' && reason.trim() !== '' && !startMutation.isPending;

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.impersonation.forbidden')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('control.impersonation.title')} subtitle={t('control.impersonation.subtitle')} />

      {activeSession ? (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning-tint/50 p-4 md:flex-row md:items-center md:justify-between"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-text">
            <TriangleAlert className="size-5 text-warning-text" aria-hidden="true" />
            {t('control.impersonation.active_banner', { tenant: activeSession.tenantName })}
          </p>
          <div className="flex items-center gap-2">
            <Badge tone="warning">{activeSession.role}</Badge>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setActiveSession(null);
                setLocalStarted(false);
              }}
            >
              {t('control.impersonation.stop')}
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('control.impersonation.start_title')}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {tenantsQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {tenantsQuery.error ? (
            <ErrorState
              title={t('control.impersonation.load_error')}
              description={String(tenantsQuery.error)}
              onRetry={() => void tenantsQuery.refetch()}
            />
          ) : null}
          {!tenantsQuery.isLoading && !tenantsQuery.error ? (
            <>
              <Field id="imp-search" label={t('control.impersonation.search_tenant')}>
                <Input
                  id="imp-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('control.impersonation.search_placeholder')}
                />
              </Field>
              <Field id="imp-tenant" label={t('control.impersonation.tenant')} required>
                <Select
                  id="imp-tenant"
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  <option value="">{t('control.impersonation.select_tenant')}</option>
                  {tenants.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="imp-role" label={t('control.impersonation.role')} required>
                <Select id="imp-role" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="imp-reason" label={t('control.impersonation.reason')} required>
                <Textarea
                  id="imp-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('control.impersonation.reason_placeholder')}
                />
              </Field>
              {startMutation.error ? (
                <p className="text-sm text-error">{String(startMutation.error)}</p>
              ) : null}
              {localStarted && !startMutation.error ? (
                <p className="text-sm text-success-text">{t('control.impersonation.started')}</p>
              ) : null}
              <Button
                disabled={!canStart}
                loading={startMutation.isPending}
                onClick={() => {
                  if (canStart) {
                    void startMutation.mutateAsync({
                      tenantId: selectedTenantId,
                      targetRole: role,
                      reason: reason.trim(),
                    });
                  }
                }}
              >
                {t('control.impersonation.start')}
              </Button>
            </>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('control.impersonation.history')}</CardTitle>
        </CardHeader>
        <CardBody>
          {historyQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {historyQuery.error ? (
            <ErrorState
              title={t('control.impersonation.load_error')}
              description={String(historyQuery.error)}
              onRetry={() => void historyQuery.refetch()}
            />
          ) : null}
          {!historyQuery.isLoading && !historyQuery.error && (historyQuery.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              title={t('control.impersonation.history_empty')}
              description={
                historyQuery.data?.missing
                  ? t('control.impersonation.migration_pending')
                  : t('control.impersonation.history_empty_hint')
              }
            />
          ) : null}
          {!historyQuery.isLoading && !historyQuery.error && (historyQuery.data?.rows.length ?? 0) > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.impersonation.tenant')}</TH>
                  <TH>{t('control.impersonation.role')}</TH>
                  <TH>{t('control.impersonation.reason')}</TH>
                  <TH>{t('control.impersonation.created')}</TH>
                </TR>
              </THead>
              <TBody>
                {(historyQuery.data?.rows ?? []).map((s) => (
                  <TR key={s.id}>
                    <TD className="text-xs text-text-subtle">{s.target_tenant_id.slice(0, 8)}…</TD>
                    <TD>
                      <Badge tone="warning">{s.target_role}</Badge>
                    </TD>
                    <TD className="max-w-xs truncate text-sm">{s.reason}</TD>
                    <TD className="text-xs text-text-subtle">{formatDay(s.created_at, locale)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
