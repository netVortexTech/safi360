import { useMemo, useState } from 'react';
import { errorKey } from '@/lib/errors';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useCurrentTenant } from '@/lib/tenant';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from './SettingsPage';

const VARIABLES = ['{{ticket}}', '{{customer}}', '{{amount}}', '{{date}}'] as const;

const SAMPLE: Record<string, string> = {
  '{{ticket}}': 'SF-2026-00042',
  '{{customer}}': 'Amina Juma',
  '{{amount}}': 'TZS 85,000',
  '{{date}}': 'Sat 17 Oct 2026',
};

function applySample(body: string): string {
  let out = body;
  for (const [k, v] of Object.entries(SAMPLE)) out = out.split(k).join(v);
  return out;
}

interface TemplateRow {
  key: string;
  body_sw: string;
  body_en: string;
  fromTable: boolean;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export default function TemplateSettings() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const canEdit = can(claims.tenant_role, 'settings.edit');
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant.data?.id ?? null;

  const templates = useQuery({
    queryKey: ['settings', 'templates', tenantId],
    enabled: tenantId != null,
    queryFn: async (): Promise<TemplateRow[]> => {
      const direct = await supabase
        .from('notification_templates')
        .select('template_key, body_sw, body_en')
        .eq('tenant_id', tenantId);
      if (!direct.error && direct.data) {
        const trows = direct.data as Record<string, unknown>[];
        return trows.map((r) => ({
          key: str(r.template_key),
          body_sw: str(r.body_sw),
          body_en: str(r.body_en),
          fromTable: true,
        }));
      }
      const fb = await supabase
        .from('notifications')
        .select('template_key')
        .eq('tenant_id', tenantId)
        .limit(200);
      if (fb.error) throw fb.error ?? direct.error;
      const nrows = fb.data as Record<string, unknown>[];
      const keys = [...new Set(nrows.map((r) => str(r.template_key)).filter(Boolean))];
      return keys.map((key) => ({ key, body_sw: '', body_en: '', fromTable: false }));
    },
  });

  const rows = useMemo(() => templates.data ?? [], [templates.data]);
  const [selected, setSelected] = useState<string>('');
  const active = rows.find((r) => r.key === selected) ?? rows[0] ?? null;
  const activeKey = active?.key ?? '';

  const [bodySw, setBodySw] = useState('');
  const [bodyEn, setBodyEn] = useState('');
  const [touched, setTouched] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const selectKey = (key: string) => {
    setSelected(key);
    const row = rows.find((r) => r.key === key);
    setBodySw(row?.body_sw ?? '');
    setBodyEn(row?.body_en ?? '');
    setTouched(false);
    setStatus(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await supabase
        .from('notification_templates')
        .upsert(
          { tenant_id: tenantId, template_key: activeKey, body_sw: bodySw, body_en: bodyEn },
          { onConflict: 'tenant_id,template_key' },
        );
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      void queryClient.invalidateQueries({ queryKey: ['settings', 'templates', tenantId] });
    },
    onError: (e) => setStatus({ kind: 'err', msg: String(e) }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_templates')}
        subtitle={t('settings.tab_templates_desc')}
        breadcrumbs={[
          { label: t('settings.title'), to: '/ops/settings' },
          { label: t('settings.tab_templates') },
        ]}
      />
      <SettingsTabs />
      {templates.isPending ? (
        <Skeleton className="h-64" />
      ) : templates.isError ? (
        <ErrorState
          description={t(errorKey(templates.error))}
          onRetry={() => void templates.refetch()}
          retrying={templates.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={t('settings.templates_empty_title')}
          description={t('settings.templates_empty_body')}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.templates_heading')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field id="tpl-key" label={t('settings.field_template')}>
                <Select id="tpl-key" value={activeKey} onChange={(e) => selectKey(e.target.value)}>
                  {rows.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.key}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="tpl-sw" label={t('settings.field_body_sw')}>
                <Textarea
                  id="tpl-sw"
                  rows={5}
                  value={touched ? bodySw : (active?.body_sw ?? bodySw)}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setBodySw(e.target.value);
                    setTouched(true);
                  }}
                />
              </Field>
              <Field id="tpl-en" label={t('settings.field_body_en')}>
                <Textarea
                  id="tpl-en"
                  rows={5}
                  value={touched ? bodyEn : (active?.body_en ?? bodyEn)}
                  disabled={!canEdit}
                  onChange={(e) => {
                    setBodyEn(e.target.value);
                    setTouched(true);
                  }}
                />
              </Field>
              <div>
                <p className="text-sm font-medium text-text">{t('settings.variables_heading')}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {VARIABLES.map((v) => (
                    <Badge key={v} tone="outline">
                      {v}
                    </Badge>
                  ))}
                </div>
              </div>
              {status ? (
                <p
                  role="status"
                  className={status.kind === 'ok' ? 'text-sm text-success-text' : 'text-sm text-error'}
                >
                  {status.msg}
                </p>
              ) : null}
              {canEdit ? (
                <Button
                  onClick={() => {
                    if (!activeKey) return;
                    if (!touched && active) {
                      setBodySw(active.body_sw);
                      setBodyEn(active.body_en);
                    }
                    setStatus(null);
                    save.mutate();
                  }}
                  loading={save.isPending}
                  disabled={!activeKey}
                >
                  {t('settings.save')}
                </Button>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.preview')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <p className="text-caption text-text-subtle">{t('settings.field_body_sw')}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                  {applySample(touched ? bodySw : (active?.body_sw ?? '')) || t('settings.preview_empty')}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted p-3">
                <p className="text-caption text-text-subtle">{t('settings.field_body_en')}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-text">
                  {applySample(touched ? bodyEn : (active?.body_en ?? '')) || t('settings.preview_empty')}
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
