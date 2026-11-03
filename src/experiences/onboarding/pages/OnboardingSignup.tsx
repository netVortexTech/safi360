import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { PhoneSignup } from '@/components/shared/PhoneSignup';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { asError } from '@/lib/errors';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const PREFIX_RE = /^[A-Z]{2,5}$/;

type Step = 'account' | 'company';

/**
 * Self-serve company signup: phone + password to create the account, then company
 * details to create the tenant + OWNER membership via signup_tenant() (migration 0034).
 * Previously the company was never created, so the user was signed in with no tenant
 * and bounced back to /signup forever.
 */
export default function OnboardingSignup() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('account');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [city, setCity] = useState('');
  const [ticketPrefix, setTicketPrefix] = useState('');
  const [slugTaken, setSlugTaken] = useState(false);
  const [prefixTaken, setPrefixTaken] = useState(false);

  const slugValid = SLUG_RE.test(slug.trim());
  const prefixValid = PREFIX_RE.test(ticketPrefix.trim());
  const stepOk =
    name.trim().length >= 2 && slugValid && prefixValid && !slugTaken && !prefixTaken;

  if (auth.status === 'signed_in' && auth.claims.tenant_id) {
    return <Navigate to="/onboarding/plan" replace />;
  }

  const checkAvailability = async (column: 'slug' | 'ticket_prefix', value: string) => {
    const fn = column === 'slug' ? 'tenant_slug_available' : 'tenant_prefix_available';
    const arg = column === 'slug' ? { p_slug: value } : { p_prefix: value };
    const rpcRes = await supabase.rpc(fn, arg) as {
      data: unknown;
      error: { message: string } | null;
    };
    if (rpcRes.error) return;
    if (column === 'slug') setSlugTaken(Boolean(rpcRes.data));
    else setPrefixTaken(Boolean(rpcRes.data));
  };

  const createCompany = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!stepOk || busy) return;
    setBusy(true);
    try {
      const { error: rpcError } = await supabase.rpc('signup_tenant', {
        p_name: name.trim(),
        p_slug: slug.trim().toLowerCase(),
        p_ticket_prefix: ticketPrefix.trim().toUpperCase(),
        p_city: city.trim() || null,
      });
      if (rpcError) throw asError(rpcError);
      await supabase.auth.refreshSession();
      navigate('/onboarding/plan', { replace: true });
    } catch (err) {
      setError(asError(err).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'account') {
    return (
      <AuthCard subtitle={t('onboarding.signup.subtitle')}>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
          {t('onboarding.step', { current: 1, total: 3 })}
        </p>
        <PhoneSignup
          title={t('onboarding.signup.title')}
          body={t('onboarding/signup.body')}
          onVerified={() => {
            setStep('company');
            return Promise.resolve();
          }}
        />
        <p className="mt-4 text-center text-sm text-text-muted">
          {t('onboarding/signup.already_have_account')}{' '}
          <Link to="/ops/login" className="text-primary hover:underline">
            {t('onboarding/signup.sign_in')}
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle={t('onboarding.signup.subtitle')}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {t('onboarding.step', { current: 2, total: 3 })}
      </p>
      <form onSubmit={createCompany} noValidate className="space-y-4">
        <div>
          <h1 className="mb-1 text-h1">{t('signup.details_title')}</h1>
          <p className="text-sm text-text-muted">{t('signup.details_body')}</p>
        </div>
        <Field
          id="company-name"
          label={t('signup.name')}
          required
          error={
            name && name.trim().length < 2 ? t('signup.name_invalid') : error ?? undefined
          }
        >
          <Input
            id="company-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            invalid={Boolean(name && name.trim().length < 2)}
          />
        </Field>
        <Field
          id="company-slug"
          label={t('signup.slug')}
          required
          hint={t('signup.slug_hint')}
          error={
            slug && !slugValid
              ? t('signup.slug_invalid')
              : slugTaken
                ? t('signup.slug_taken')
                : undefined
          }
        >
          <Input
            id="company-slug"
            value={slug}
            onChange={(e) => {
              const v = e.target.value.toLowerCase().replace(/\s+/g, '-');
              setSlug(v);
              if (SLUG_RE.test(v)) void checkAvailability('slug', v);
            }}
            invalid={Boolean((slug && !slugValid) || slugTaken)}
          />
        </Field>
        <Field id="company-city" label={t('signup.city')}>
          <Input id="company-city" value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
        <Field
          id="company-prefix"
          label={t('signup.ticket_prefix')}
          required
          hint={t('signup.ticket_prefix_hint')}
          error={
            ticketPrefix && !prefixValid
              ? t('signup.ticket_prefix_invalid')
              : prefixTaken
                ? t('signup.ticket_prefix_taken')
                : undefined
          }
        >
          <Input
            id="company-prefix"
            value={ticketPrefix}
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
              setTicketPrefix(v);
              if (PREFIX_RE.test(v)) void checkAvailability('ticket_prefix', v);
            }}
            invalid={Boolean((ticketPrefix && !prefixValid) || prefixTaken)}
          />
        </Field>
        {error && (
          <p role="alert" className="py-2 text-sm text-error">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" loading={busy} disabled={!stepOk}>
          {t('signup.submit')}
        </Button>
      </form>
    </AuthCard>
  );
}
