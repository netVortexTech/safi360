import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Copy, Check } from 'lucide-react';
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

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export default function ChannelSettings() {
  const { t } = useTranslation();
  const tenant = useCurrentTenant();
  const tenantId = tenant.data?.id ?? null;
  const [copied, setCopied] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['settings', 'channels', tenantId],
    enabled: tenantId != null,
    queryFn: async (): Promise<Record<string, unknown>> => {
      const res = await supabase
        .from('tenants')
        .select('slug, name, phone, phone_e164')
        .eq('id', tenantId)
        .single();
      if (res.error) {
        const fallback = await supabase.from('tenants').select('slug, name').eq('id', tenantId).single();
        if (fallback.error) throw fallback.error;
        const fbRow = fallback.data as Record<string, unknown>;
        return fbRow;
      }
      const row = res.data as Record<string, unknown>;
      return row;
    },
  });

  const slug = str(detail.data?.slug) || tenant.data?.slug || '';
  const phone = str(detail.data?.phone_e164) || str(detail.data?.phone);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const bookingUrl = useMemo(() => (slug ? `${origin}/${slug}` : ''), [origin, slug]);
  const widgetSnippet = useMemo(
    () => (slug ? `<script src="${origin}/widget.js" data-tenant="${slug}"></script>` : ''),
    [origin, slug],
  );
  const waLink = useMemo(() => {
    const digits = phone.replace(/[^\d]/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits}?text=${encodeURIComponent(t('settings.wa_prefill'))}`;
  }, [phone, t]);
  const qrUrl = useMemo(
    () =>
      bookingUrl
        ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(bookingUrl)}`
        : '',
    [bookingUrl],
  );

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_channels')}
        subtitle={t('settings.tab_channels_desc')}
        breadcrumbs={[
          { label: t('settings.title'), to: '/ops/settings' },
          { label: t('settings.tab_channels') },
        ]}
      />
      <SettingsTabs />
      {detail.isPending ? (
        <Skeleton className="h-64" />
      ) : detail.isError ? (
        <ErrorState
          description={String(detail.error)}
          onRetry={() => void detail.refetch()}
          retrying={detail.isFetching}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.booking_link_heading')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field id="channel-url" label={t('settings.field_booking_url')}>
                <div className="flex gap-2">
                  <Input id="channel-url" readOnly value={bookingUrl} />
                  <Button
                    variant="secondary"
                    onClick={() => void copy('url', bookingUrl)}
                    aria-label={t('settings.copy')}
                  >
                    {copied === 'url' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
              </Field>
              <Field id="channel-widget" label={t('settings.field_widget')}>
                <div className="flex gap-2">
                  <Input id="channel-widget" readOnly value={widgetSnippet} />
                  <Button
                    variant="secondary"
                    onClick={() => void copy('widget', widgetSnippet)}
                    aria-label={t('settings.copy')}
                  >
                    {copied === 'widget' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </Button>
                </div>
              </Field>
              <Field id="channel-wa" label={t('settings.field_whatsapp')}>
                {waLink ? (
                  <div className="flex gap-2">
                    <Input id="channel-wa" readOnly value={waLink} />
                    <Button
                      variant="secondary"
                      onClick={() => void copy('wa', waLink)}
                      aria-label={t('settings.copy')}
                    >
                      {copied === 'wa' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-text-subtle">{t('settings.no_phone_hint')}</p>
                )}
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('settings.qr_heading')}</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col items-center gap-3">
              {qrUrl ? (
                <>
                  <img
                    src={qrUrl}
                    alt={t('settings.qr_heading')}
                    className="size-48 rounded border border-border object-contain"
                    loading="lazy"
                  />
                  <a
                    href={qrUrl}
                    download={`qr-${slug}.png`}
                    className="text-sm text-primary hover:underline"
                  >
                    {t('settings.qr_download')}
                  </a>
                  <p className="text-center text-sm text-text-subtle">{bookingUrl}</p>
                </>
              ) : (
                <p className="text-sm text-text-subtle">{t('settings.no_slug_hint')}</p>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
