import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { Field } from '@/components/shared/Field';
import { PhoneSignup } from '@/components/shared/PhoneSignup';
import { Button } from '@/components/ui/button';
import { AlertCircle } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/lib/auth';
import { asError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const PREFIX_RE = /^[A-Z]{2,5}$/;

/** Account (phone, password, code), company details, then the plan page. */
const ONBOARDING_STEPS = 3;

interface CompanyForm {
  name: string;
  slug: string;
  city: string;
  ticketPrefix: string;
}

// Availability goes through SECURITY DEFINER functions (migration 0034): RLS hides every
// other company from this user, so a plain select would always say "available".
async function slugAvailable(slug: string): Promise<boolean> {
  const res: { data: unknown; error: unknown } = await supabase.rpc('tenant_slug_available', {
    p_slug: slug,
  });
  if (res.error) throw asError(res.error);
  return res.data === true;
}

async function prefixAvailable(prefix: string): Promise<boolean> {
  const res: { data: unknown; error: unknown } = await supabase.rpc('tenant_prefix_available', {
    p_prefix: prefix,
  });
  if (res.error) throw asError(res.error);
  return res.data === true;
}

type SignupFailure = 'slug_taken' | 'prefix_taken' | 'already_member' | 'generic';

/** What signup_tenant() refused, from the Postgres error it raised. */
function signupFailure(err: unknown): SignupFailure {
  const e = asError(err) as Error & { code?: string };
  if (e.message.includes('already_member')) return 'already_member';
  if (e.message.includes('tenants_slug_not_reserved')) return 'slug_taken';
  if (e.code === '23505' || /duplicate key/i.test(e.message)) {
    if (e.message.includes('ticket_prefix')) return 'prefix_taken';
    if (e.message.includes('slug')) return 'slug_taken';
  }
  return 'generic';
}

/**
 * Self-serve company signup: phone + password → SMS code → company details. The company,
 * the owner's profile and the OWNER membership are created server-side by
 * signup_tenant(); the phone is the one just verified by the code.
 */
export default function OnboardingSignup() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<CompanyForm>({ name: '', slug: '', city: '', ticketPrefix: '' });
  const [slugTaken, setSlugTaken] = useState(false);
  const [prefixTaken, setPrefixTaken] = useState(false);
  // Set once this page created the company, so the new tenant claims do not bounce the
  // owner to /ops before they have seen the plan page.
  const [created, setCreated] = useState(false);

  // Once a session exists (code just verified, or already signed in without a company)
  // the only thing left is the company form.
  const step = auth.status === 'signed_in' ? 'details' : 'account';

  const slugValid = SLUG_RE.test(form.slug.trim());
  const prefixValid = PREFIX_RE.test(form.ticketPrefix.trim());
  const nameValid = form.name.trim().length >= 2;
  const detailsOk = nameValid && slugValid && !slugTaken && prefixValid && !prefixTaken;

  if (auth.status === 'signed_in' && auth.claims.tenant_id && !created) {
    return <Navigate to="/ops" replace />;
  }

  const checkSlug = async () => {
    const slug = form.slug.trim();
    if (!SLUG_RE.test(slug)) return;
    try {
      setSlugTaken(!(await slugAvailable(slug)));
    } catch {
      setSlugTaken(false); // the server re-checks on submit
    }
  };

  const checkPrefix = async () => {
    const prefix = form.ticketPrefix.trim();
    if (!PREFIX_RE.test(prefix)) return;
    try {
      setPrefixTaken(!(await prefixAvailable(prefix)));
    } catch {
      setPrefixTaken(false);
    }
  };

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailsOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res: { data: unknown; error: unknown } = await supabase.rpc('signup_tenant', {
        p_name: form.name.trim(),
        p_slug: form.slug.trim(),
        p_ticket_prefix: form.ticketPrefix.trim(),
        p_city: form.city.trim() || null,
      });
      if (res.error) throw asError(res.error);
      setCreated(true);
      // The access-token hook adds the new tenant claims to the next token.
      await supabase.auth.refreshSession();
      navigate('/onboarding/plan', { replace: true, state: { onboarding: true } });
    } catch (err) {
      const why = signupFailure(err);
      if (why === 'slug_taken') setSlugTaken(true);
      else if (why === 'prefix_taken') setPrefixTaken(true);
      else {
        logger.warn('signup_tenant failed', { reason: why, message: asError(err).message });
        setError(
          t(why === 'already_member' ? 'onboarding.signup.already_member' : 'onboarding.signup.error'),
        );
      }
      setBusy(false);
    }
  };

  return (
    <AuthCard subtitle={t('onboarding.signup.subtitle')}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {t('onboarding.step', { current: step === 'details' ? 2 : 1, total: ONBOARDING_STEPS })}
      </p>
      {step === 'account' && (
        <PhoneSignup title={t('onboarding.signup.title')} body={t('onboarding.signup.body')} />
      )}

      {step === 'details' && (
        <form onSubmit={(e) => void submitDetails(e)} noValidate>
          <h1 className="mb-1 text-h1">{t('onboarding.signup.details_title')}</h1>
          <p className="mb-5 text-sm text-text-muted">{t('onboarding.signup.details_body')}</p>

          {error && (
            <div
              role="alert"
              className="mb-4 flex items-center gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error"
            >
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <Field
            id="su-name"
            label={t('onboarding.signup.name')}
            required
            error={form.name && !nameValid ? t('onboarding.signup.name_invalid') : undefined}
          >
            <Input
              id="su-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field
            id="su-slug"
            label={t('onboarding.signup.slug')}
            required
            hint={t('onboarding.signup.slug_hint')}
            error={
              form.slug && !slugValid
                ? t('onboarding.signup.slug_invalid')
                : slugTaken
                  ? t('onboarding.signup.slug_taken')
                  : undefined
            }
          >
            <Input
              id="su-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTaken(false);
                setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') });
              }}
              onBlur={() => void checkSlug()}
              invalid={Boolean((form.slug && !slugValid) || slugTaken)}
            />
          </Field>

          <Field id="su-city" label={t('onboarding.signup.city')}>
            <Input
              id="su-city"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </Field>

          <Field
            id="su-prefix"
            label={t('onboarding.signup.ticket_prefix')}
            required
            hint={t('onboarding.signup.ticket_prefix_hint')}
            error={
              form.ticketPrefix && !prefixValid
                ? t('onboarding.signup.ticket_prefix_invalid')
                : prefixTaken
                  ? t('onboarding.signup.ticket_prefix_taken')
                  : undefined
            }
          >
            <Input
              id="su-prefix"
              value={form.ticketPrefix}
              onChange={(e) => {
                setPrefixTaken(false);
                setForm({
                  ...form,
                  ticketPrefix: e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z]/g, '')
                    .slice(0, 5),
                });
              }}
              onBlur={() => void checkPrefix()}
              invalid={Boolean((form.ticketPrefix && !prefixValid) || prefixTaken)}
            />
          </Field>

          <Button type="submit" className="mt-4 w-full" loading={busy} disabled={!detailsOk}>
            {t('onboarding.signup.submit')}
          </Button>
        </form>
      )}

      {step === 'account' && (
        <p className="mt-4 text-center text-sm text-text-muted">
          {t('onboarding.signup.already_have_account')}{' '}
          <Link to="/ops/login" className="text-primary hover:underline">
            {t('onboarding.signup.sign_in')}
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
