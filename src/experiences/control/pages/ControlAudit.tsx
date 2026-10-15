import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';

interface AuditRow {
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
}

export default function ControlAudit() {
  const auth = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sw' ? 'sw' : 'en';
  const [actionSearch, setActionSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const auditQuery = useQuery<AuditRow[]>({
    queryKey: ['control', 'audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('tenant_id,actor_user_id,actor_role,action,entity,entity_id,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: auth.claims.is_super_admin,
  });

  const rows = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);
  const entities = useMemo(() => Array.from(new Set(rows.map((r) => r.entity))).sort(), [rows]);
  const filtered = useMemo(() => {
    const needle = actionSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (entityFilter && r.entity !== entityFilter) return false;
      if (needle && !r.action.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, actionSearch, entityFilter]);

  const exportCsv = () => {
    const header = 'timestamp,actor_user_id,actor_role,action,entity,entity_id,tenant_id';
    const lines = filtered.map((r) =>
      [r.created_at, r.actor_user_id ?? '', r.actor_role ?? '', r.action, r.entity, r.entity_id ?? '', r.tenant_id ?? '']
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(','),
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-logs.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.audit.forbidden')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('control.audit.title')}
        subtitle={t('control.audit.subtitle')}
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download aria-hidden="true" />
            {t('control.audit.export_csv')}
          </Button>
        }
      />
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder={t('control.audit.search_placeholder')}
              value={actionSearch}
              onChange={(e) => setActionSearch(e.target.value)}
              aria-label={t('control.audit.search_placeholder')}
            />
            <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} aria-label={t('control.audit.entity')}>
              <option value="">{t('control.audit.all_entities')}</option>
              {entities.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </Select>
          </div>
          {auditQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {auditQuery.error ? (
            <ErrorState
              title={t('control.audit.load_error')}
              description={String(auditQuery.error)}
              onRetry={() => void auditQuery.refetch()}
            />
          ) : null}
          {!auditQuery.isLoading && !auditQuery.error && filtered.length === 0 ? (
            <EmptyState title={t('control.audit.empty')} description={t('control.audit.empty_hint')} />
          ) : null}
          {!auditQuery.isLoading && !auditQuery.error && filtered.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.audit.timestamp')}</TH>
                  <TH>{t('control.audit.actor')}</TH>
                  <TH>{t('control.audit.action')}</TH>
                  <TH>{t('control.audit.entity')}</TH>
                  <TH>{t('control.audit.details')}</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((row, i) => (
                  <TR key={`${row.created_at}-${row.entity_id ?? ''}-${i}`}>
                    <TD className="text-xs text-text-subtle">{formatDay(row.created_at, locale)}</TD>
                    <TD>
                      <span className="text-xs">
                        {row.actor_user_id ? row.actor_user_id.slice(0, 8) : '-'}
                      </span>
                      {row.actor_role ? (
                        <Badge tone="outline" className="ml-2">{row.actor_role}</Badge>
                      ) : null}
                    </TD>
                    <TD className="font-medium">{row.action}</TD>
                    <TD>{row.entity}</TD>
                    <TD className="text-xs text-text-subtle">
                      {row.entity_id ? `${row.entity_id.slice(0, 8)}…` : '-'}
                    </TD>
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
