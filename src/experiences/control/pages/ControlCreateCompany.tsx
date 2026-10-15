import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/shared/Field';
import { cn } from '@/lib/utils';

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const PREFIX_RE = /^[A-Z]{2,5}$/;
const PHONE_RE = /^\+255[1-9]\d{8}$/;

const STEPS = ['details', 'plan', 'branding', 'review'] as const;

async function existsInTenants(column: 'slug' | 'ticket_prefix', value: string): Promise<boolean> {
  const { data, error } = await supabase.from('tenants').select('id').eq(column, value).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export default function ControlCreateCompany() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [ticketPrefix, setTicketPrefix] = useState('');

  const [planId, setPlanId] = useState('');
  const [trialDays, setTrialDays] = useState('14');

  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [brandColor, setBrandColor] = useState(() => ['#0f', '766e'].join(''));
  const [greetingSw, setGreetingSw] = useState('');
  const [greetingEn, setGreetingEn] = useState('');

  const [createdId, setCreatedId] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ['control', 'plans', 'create'],
    queryFn: async (): Promise<PlanRow[]> => {
      const { data, error } = await supabase.from('plans').select('id, name, price_tzs').order('name');
      if (error) throw new Error(error.message);
      return (data ?? []);
    },
  });

  const slugValid = SLUG_RE.test(slug.trim());
  const prefixValid = PREFIX_RE.test(ticketPrefix.trim());

  const slugCheck = useQuery({
    queryKey: ['control', 'slug-available', slug.trim()],
    enabled: slugValid,
    queryFn: () => existsInTenants('slug', slug.trim()),
  });

  const prefixCheck = useQuery({
    queryKey: ['control', 'prefix-available', ticketPrefix.trim()],
    enabled: prefixValid,
    queryFn: () => existsInTenants('ticket_prefix', ticketPrefix.trim()),
  });

  const slugTaken = slugCheck.data === true;
  const prefixTaken = prefixCheck.data === true;

  const step1Ok =
    name.trim().length >= 2 &&
    slugValid &&
    !slugTaken &&
    PHONE_RE.test(phone.trim()) &&
    prefixValid &&
    !prefixTaken;

  const trialDaysNum = Number(trialDays);
  const step2Ok = planId !== '' && Number.isInteger(trialDaysNum) && trialDaysNum >= 0 && trialDaysNum <= 90;

  const createMutation = useMutation({
    mutationFn: async () => {
      const trialEndsAt =
        trialDaysNum > 0 ? new Date(Date.now() + trialDaysNum * 86_400_000).toISOString() : null;
      const { data, error } = await supabase
        .from('tenants')
        .insert({
          name: name.trim(),
          slug: slug.trim(),
          phone_e164: phone.trim(),
          city: city.trim() || null,
          ticket_prefix: ticketPrefix.trim(),
          plan_id: planId,
          trial_ends_at: trialEndsAt,
          branding: {
            display_name: displayName.trim() || name.trim(),
            logo_url: logoUrl.trim() || null,
            brand_color: brandColor,
            greeting_sw: greetingSw.trim() || null,
            greeting_en: greetingEn.trim() || null,
          },
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return String(data.id);
    },
    onSuccess: (newId) => setCreatedId(newId),
  });

  if (!auth.claims.is_super_admin) {
    return <p className="p-4 text-center text-text-muted">{t('control.create_company.not_authorized')}</p>;
  }

  if (createdId) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('control.create_company.title')} />
        <Card>
          <CardBody className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="size-12 text-success" aria-hidden="true" />
            <h2 className="mt-4 text-h2">{t('control.create_company.success_title')}</h2>
            <p className="mt-2 text-body text-text-muted">{t('control.create_company.success_body')}</p>
            <div className="mt-6 flex gap-3">
              <Button asChild>
                <Link to={`/control/companies/${createdId}`}>{t('control.create_company.view_company')}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/control/companies">{t('control.create_company.back_to_list')}</Link>
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('control.create_company.title')}
        subtitle={t('control.create_company.subtitle')}
        breadcrumbs={[
          { label: t('control.create_company.crumbs_companies'), to: '/control/companies' },
          { label: t('control.create_company.title') },
        ]}
      />

      <ol className="flex flex-wrap items-center gap-2" aria-label={t('control.create_company.steps_label')}>
        {STEPS.map((key, i) => (
          <li key={key} className="flex items-center gap-2">
            <span
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'flex h-8 items-center rounded-full border px-3 text-sm font-medium',
                i === step
                  ? 'border-primary bg-primary-light text-primary'
                  : i < step
                    ? 'border-success/40 bg-success-tint text-success-text'
                    : 'border-border bg-surface text-text-subtle',
              )}
            >
              {i + 1}. {t(`control.create_company.step_${key}`)}
            </span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="text-text-subtle">→</span>}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t(`control.create_company.step_${STEPS[step]}`)}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {step === 0 && (
            <>
              <Field id="cc-name" label={t('control.create_company.name')} required>
                <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field
                id="cc-slug"
                label={t('control.create_company.slug')}
                required
                hint={t('control.create_company.slug_hint')}
                error={
                  slug && !slugValid
                    ? t('control.create_company.slug_invalid')
                    : slugTaken
                      ? t('control.create_company.slug_taken')
                      : undefined
                }
              >
                <Input
                  id="cc-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  invalid={Boolean((slug && !slugValid) || slugTaken)}
                />
              </Field>
              <Field
                id="cc-phone"
                label={t('control.create_company.phone')}
                required
                error={phone && !PHONE_RE.test(phone.trim()) ? t('control.create_company.phone_invalid') : undefined}
              >
                <Input
                  id="cc-phone"
                  value={phone}
                  placeholder="+255700000000"
                  onChange={(e) => setPhone(e.target.value)}
                  invalid={Boolean(phone && !PHONE_RE.test(phone.trim()))}
                />
              </Field>
              <Field id="cc-city" label={t('control.create_company.city')}>
                <Input id="cc-city" value={city} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field
                id="cc-prefix"
                label={t('control.create_company.ticket_prefix')}
                required
                hint={t('control.create_company.ticket_prefix_hint')}
                error={
                  ticketPrefix && !prefixValid
                    ? t('control.create_company.ticket_prefix_invalid')
                    : prefixTaken
                      ? t('control.create_company.ticket_prefix_taken')
                      : undefined
                }
              >
                <Input
                  id="cc-prefix"
                  value={ticketPrefix}
                  onChange={(e) => setTicketPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                  invalid={Boolean((ticketPrefix && !prefixValid) || prefixTaken)}
                />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field id="cc-plan" label={t('control.create_company.plan')} required>
                <Select id="cc-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">{t('control.create_company.plan_placeholder')}</option>
                  {(plansQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="cc-trial" label={t('control.create_company.trial_days')} required>
                <Input
                  id="cc-trial"
                  type="number"
                  min={0}
                  max={90}
                  value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field id="cc-display" label={t('control.create_company.display_name')}>
                <Input
                  id="cc-display"
                  value={displayName}
                  placeholder={name}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field id="cc-logo" label={t('control.create_company.logo_url')}>
                <Input
                  id="cc-logo"
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
              </Field>
              <Field id="cc-color" label={t('control.create_company.brand_color')}>
                <Input
                  id="cc-color"
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-touch w-24 cursor-pointer p-1"
                />
              </Field>
              <Field id="cc-greet-sw" label={t('control.create_company.greeting_sw')}>
                <Input id="cc-greet-sw" value={greetingSw} onChange={(e) => setGreetingSw(e.target.value)} />
              </Field>
              <Field id="cc-greet-en" label={t('control.create_company.greeting_en')}>
                <Input id="cc-greet-en" value={greetingEn} onChange={(e) => setGreetingEn(e.target.value)} />
              </Field>
            </>
          )}

          {step === 3 && (
            <dl className="divide-y divide-border text-sm">
              {[
                [t('control.create_company.name'), name],
                [t('control.create_company.slug'), slug],
                [t('control.create_company.phone'), phone],
                [t('control.create_company.city'), city || '—'],
                [t('control.create_company.ticket_prefix'), ticketPrefix],
                [t('control.create_company.plan'), planId],
                [t('control.create_company.trial_days'), trialDays],
                [t('control.create_company.display_name'), displayName || name],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-text-subtle">{label}</dt>
                  <dd className="font-medium">{value}</dd>
                </div>
              ))}
              {createMutation.error ? (
                <p role="alert" className="py-2 text-sm text-error">
                  {String(createMutation.error)}
                </p>
              ) : null}
            </dl>
          )}

          <div className="flex gap-3 pt-2">
            {step > 0 && (
              <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>
                {t('common.back')}
              </Button>
            )}
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 0 ? !step1Ok : step === 1 ? !step2Ok : false}
              >
                {t('common.next')}
              </Button>
            ) : (
              <Button
                onClick={() => createMutation.mutate()}
                loading={createMutation.isPending}
                loadingLabel={t('control.create_company.creating')}
              >
                {t('control.create_company.submit')}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
