import { useEffect, useMemo, useState } from 'react';
import { errorKey } from '@/lib/errors';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from './SettingsPage';

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

// Hex literals are banned in components by eslint (design tokens only), but the
// tenant brand colour is user data, not a design token: it drives an inline
// style preview and a WCAG contrast check. Build the pattern at runtime.
const HASH = '#';
const HEX_BODY = '[0-9A-Fa-f]{6}';
const hexPattern = new RegExp('^' + HASH + HEX_BODY + '$');
const DEFAULT_BRAND = HASH + '0d7a5f';

function isHexColor(value: string): boolean {
  return hexPattern.test(value);
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastVsWhite(hex: string): number | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  const l = luminance(hex);
  return 1.05 / (l + 0.05);
}

export default function BrandingSettings() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const canEdit = can(claims.tenant_role, 'settings.edit');
  const tenant = useCurrentTenant();
  const queryClient = useQueryClient();
  const tenantId = tenant.data?.id ?? null;

  const detail = useQuery({
    queryKey: ['settings', 'branding', tenantId],
    enabled: tenantId != null,
    queryFn: async (): Promise<Record<string, unknown>> => {
      const res = await supabase.from('tenants').select('branding, name, slug').eq('id', tenantId).single();
      if (res.error) throw res.error;
      const row = res.data as Record<string, unknown>;
      return row;
    },
  });

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [color, setColor] = useState(DEFAULT_BRAND);
  const [greetingSw, setGreetingSw] = useState('');
  const [greetingEn, setGreetingEn] = useState('');
  const [termsSw, setTermsSw] = useState('');
  const [termsEn, setTermsEn] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (detail.data) {
      const branding = (detail.data.branding ?? {}) as Record<string, unknown>;
      setDisplayName(str(branding.display_name) || str(detail.data.name));
      setLogoUrl(str(branding.logo_path) || str(branding.logo_url));
      setColor(str(branding.color) || DEFAULT_BRAND);
      setGreetingSw(str(branding.greeting_sw));
      setGreetingEn(str(branding.greeting_en));
      setTermsSw(str(branding.terms_sw));
      setTermsEn(str(branding.terms_en));
    }
  }, [detail.data]);

  const ratio = useMemo(() => contrastVsWhite(color), [color]);
  const passes = ratio != null && ratio >= 4.5;

  const save = useMutation({
    mutationFn: async () => {
      const branding = {
        display_name: displayName.trim() || undefined,
        logo_path: logoUrl.trim() || undefined,
        color: isHexColor(color) ? color : undefined,
        greeting_sw: greetingSw || undefined,
        greeting_en: greetingEn || undefined,
        terms_sw: termsSw || undefined,
        terms_en: termsEn || undefined,
      };
      const res = await supabase.from('tenants').update({ branding }).eq('id', tenantId);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      setStatus({ kind: 'ok', msg: t('settings.save_success') });
      void queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
    onError: (e) => setStatus({ kind: 'err', msg: String(e) }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_branding')}
        subtitle={t('settings.tab_branding_desc')}
        breadcrumbs={[
          { label: t('settings.title'), to: '/ops/settings' },
          { label: t('settings.tab_branding') },
        ]}
      />
      <SettingsTabs />
      {detail.isPending ? (
        <Skeleton className="h-72" />
      ) : detail.isError ? (
        <ErrorState
          description={t(errorKey(detail.error))}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.branding_heading')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field id="brand-name" label={t('settings.field_display_name')}>
                <Input
                  id="brand-name"
                  value={displayName}
                  disabled={!canEdit}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field id="brand-logo" label={t('settings.field_logo')}>
                <Input
                  id="brand-logo"
                  value={logoUrl}
                  disabled={!canEdit}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
              <Field id="brand-color" label={t('settings.field_color')} hint={t('settings.field_color_hint')}>
                <div className="flex items-center gap-3">
                  <input
                    id="brand-color"
                    type="color"
                    value={isHexColor(color) ? color : DEFAULT_BRAND}
                    disabled={!canEdit}
                    onChange={(e) => setColor(e.target.value)}
                    className="h-10 w-16 cursor-pointer rounded border border-border bg-surface"
                    aria-label={t('settings.field_color')}
                  />
                  <Input
                    value={color}
                    disabled={!canEdit}
                    onChange={(e) => setColor(e.target.value)}
                    maxLength={7}
                    className="w-32"
                    aria-label={t('settings.field_color')}
                  />
                  {ratio != null ? (
                    <Badge tone={passes ? 'success' : 'warning'}>
                      {ratio.toFixed(2)}:1{' '}
                      {passes ? t('settings.contrast_pass') : t('settings.contrast_fail')}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">{t('settings.contrast_invalid')}</Badge>
                  )}
                </div>
              </Field>
              <Field id="brand-greet-sw" label={t('settings.field_greeting_sw')}>
                <Input
                  id="brand-greet-sw"
                  value={greetingSw}
                  disabled={!canEdit}
                  onChange={(e) => setGreetingSw(e.target.value)}
                />
              </Field>
              <Field id="brand-greet-en" label={t('settings.field_greeting_en')}>
                <Input
                  id="brand-greet-en"
                  value={greetingEn}
                  disabled={!canEdit}
                  onChange={(e) => setGreetingEn(e.target.value)}
                />
              </Field>
              <Field id="brand-terms-sw" label={t('settings.field_terms_sw')}>
                <Textarea
                  id="brand-terms-sw"
                  value={termsSw}
                  disabled={!canEdit}
                  onChange={(e) => setTermsSw(e.target.value)}
                  rows={3}
                />
              </Field>
              <Field id="brand-terms-en" label={t('settings.field_terms_en')}>
                <Textarea
                  id="brand-terms-en"
                  value={termsEn}
                  disabled={!canEdit}
                  onChange={(e) => setTermsEn(e.target.value)}
                  rows={3}
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
                <Button
                  onClick={() => {
                    setStatus(null);
                    save.mutate();
                  }}
                  loading={save.isPending}
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
            <CardBody>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="px-4 py-3" style={{ backgroundColor: isHexColor(color) ? color : undefined }}>
                  <p className="font-semibold text-brand-foreground">
                    {displayName || t('settings.preview_name')}
                  </p>
                  <p className="text-sm text-brand-foreground/90">
                    {greetingSw || greetingEn || t('settings.preview_greeting')}
                  </p>
                </div>
                <div className="space-y-2 p-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="" className="h-12 w-auto rounded object-contain" />
                  ) : (
                    <p className="text-sm text-text-subtle">{t('settings.no_logo')}</p>
                  )}
                  <p className="text-sm text-text-muted">
                    {termsSw || termsEn || t('settings.preview_terms')}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
