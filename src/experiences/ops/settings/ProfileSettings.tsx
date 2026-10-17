import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { useCurrentTenant } from '@/lib/tenant';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from './SettingsPage';

type TenantRow = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export default function ProfileSettings() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const canEdit = can(claims.tenant_role, 'settings.edit');
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();

  const tenantId = tenant.data?.id ?? null;

  const detail = useQuery({
    queryKey: ['settings', 'profile', tenantId],
    enabled: tenantId != null,
    queryFn: async (): Promise<TenantRow> => {
      const res = await supabase.from('tenants').select('*').eq('id', tenantId).single();
      if (res.error) throw res.error;
      const row = res.data as TenantRow;
      return row;
    },
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [prefix, setPrefix] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (detail.data) {
      const row = detail.data;
      setName(str(row.name) || tenant.data?.name || '');
      setPhone(str(row.phone) || str(row.phone_e164) || '');
      setCity(str(row.city) || '');
      setPrefix(str(row.ticket_prefix) || tenant.data?.ticket_prefix || '');
    }
  }, [detail.data, tenant.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        ticket_prefix: prefix.trim().toUpperCase(),
      };
      if (phone.trim()) {
        payload.phone = phone.trim();
        payload.phone_e164 = phone.trim();
      }
      if (city.trim()) payload.city = city.trim();
      const res = await supabase.from('tenants').update(payload).eq('id', tenantId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
      void queryClient.invalidateQueries({ queryKey: ['settings', 'channels', tenantId] });
      void detail.refetch();
    },
    onError: (e) => setStatus({ kind: 'err', msg: String(e) }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_profile')}
        subtitle={t('settings.tab_profile_desc')}
        breadcrumbs={[
          { label: t('settings.title'), to: '/ops/settings' },
          { label: t('settings.tab_profile') },
        ]}
      />
      <SettingsTabs />
      {tenant.isPending || detail.isPending ? (
        <Skeleton className="h-64" />
      ) : tenant.isError || detail.isError ? (
        <ErrorState
          description={String(tenant.error ?? detail.error)}
          onRetry={() => {
            void tenant.refetch();
            void detail.refetch();
          }}
          retrying={tenant.isFetching || detail.isFetching}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.profile_heading')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            {!canEdit ? <p className="text-sm text-text-muted">{t('settings.readonly')}</p> : null}
            <Field id="profile-name" label={t('settings.field_name')} required>
              <Input
                id="profile-name"
                value={name}
                disabled={!canEdit}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field id="profile-phone" label={t('settings.field_phone')}>
              <Input
                id="profile-phone"
                value={phone}
                disabled={!canEdit}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+255…"
              />
            </Field>
            <Field id="profile-city" label={t('settings.field_city')}>
              <Input
                id="profile-city"
                value={city}
                disabled={!canEdit}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
            <Field
              id="profile-prefix"
              label={t('settings.field_prefix')}
              hint={t('settings.field_prefix_hint')}
            >
              <Input
                id="profile-prefix"
                value={prefix}
                disabled={!canEdit}
                onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                maxLength={5}
              />
            </Field>
            {status ? (
              <p
                role="status"
                className={status.kind === 'ok' ? 'text-sm text-success-text' : 'text-sm text-error'}
              >
                {status.msg}
              </p>
            ) : null}
            {canEdit ? (
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setStatus(null);
                    save.mutate();
                  }}
                  loading={save.isPending}
                  disabled={!name.trim() || !prefix.trim()}
                >
                  {t('settings.save')}
                </Button>
                <Button variant="secondary" asChild>
                  <Link to="/ops/settings">{t('common.cancel')}</Link>
                </Button>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
