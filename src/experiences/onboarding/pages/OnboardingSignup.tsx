import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { CodeInput } from '@/components/shared/CodeInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/Field';
import { supabase } from '@/lib/supabase';
import { isSandbox } from '@/lib/env';
import { formatPhone } from '@/lib/phone';
import { SandboxBadge } from '@/components/shared/SandboxBadge';
import { AlertCircle } from '@/components/ui/icons';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const PREFIX_RE = /^[A-Z]{2,5}$/;

type Step = 'phone' | 'code' | 'details';

interface SignupData {
  phoneE164: string;
  name: string;
  slug: string;
  city: string;
  ticketPrefix: string;
}

export default function OnboardingSignup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [signupData, setSignupData] = useState<SignupData>({
    phoneE164: '',
    name: '',
    slug: '',
    city: '',
    ticketPrefix: '',
  });
  const [slugTaken, setSlugTaken] = useState(false);
  const [prefixTaken, setPrefixTaken] = useState(false);

  const slugValid = SLUG_RE.test(signupData.slug.trim());
  const prefixValid = PREFIX_RE.test(signupData.ticketPrefix.trim());

  const step2Ok =
    signupData.name.trim().length >= 2 &&
    slugValid &&
    !slugTaken &&
    prefixValid &&
    !prefixTaken;

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (!phoneE164) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneE164,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('code');
      setCode('');
      // Store phone in signup data for later use
      setSignupData(prev => ({ ...prev, phoneE164 }));
    } catch (err) {
      setError(t('auth.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!phoneE164 || value.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: value,
        type: 'sms',
      });
      if (error) throw error;
      // Session created, now go to details step
      setStep('details');
    } catch (err) {
      setError(t('auth.errors.invalid_code'));
      setBusy(false);
    }
  };

  const checkSlug = async () => {
    if (!slugValid) return;
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('slug', signupData.slug.trim())
        .limit(1);
      if (error) throw error;
      setSlugTaken((data ?? []).length > 0);
    } catch {
      setSlugTaken(false);
    }
  };

  const checkPrefix = async () => {
    if (!prefixValid) return;
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id')
        .eq('ticket_prefix', signupData.ticketPrefix.trim())
        .limit(1);
      if (error) throw error;
      setPrefixTaken((data ?? []).length > 0);
    } catch {
      setPrefixTaken(false);
    }
  };

  const submitDetails = async (e: FormEvent) => {
    e.preventDefault();
    if (!step2Ok) return;
    setBusy(true);
    setError(null);
    try {
      const trialEndsAt = new Date(Date.now() + 7 * 86_400_000).toISOString(); // 7 days
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('User not authenticated');

      // Insert tenant and get the ID back
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({
          name: signupData.name.trim(),
          slug: signupData.slug.trim(),
          phone_e164: phoneE164!,
          city: signupData.city.trim() || null,
          ticket_prefix: signupData.ticketPrefix.trim(),
          plan_id: null,
          status: 'TRIAL',
          trial_ends_at: trialEndsAt,
          branding: {
            display_name: signupData.name.trim(),
          },
          settings: {
            deposit_pct: 30,
            cancel_hours: 4,
            slot_hold_minutes: 15,
            travel_buffer_min: 45,
            quote_expiry_hours: 144,
            languages: ['sw', 'en'],
            default_locale: 'sw',
            working_hours: {
              mon: { open: '08:00', close: '18:00' },
              tue: { open: '08:00', close: '18:00' },
              wed: { open: '08:00', close: '18:00' },
              thu: { open: '08:00', close: '18:00' },
              fri: { open: '08:00', close: '18:00' },
              sat: { open: '08:00', close: '16:00' },
              sun: { open: '09:00', close: '13:00', closed: true },
            },
          },
        })
        .select('id')
        .single();

      if (tenantError || !tenant) throw tenantError ?? new Error('Failed to create tenant');

      // Create profile for the user
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: userData.user.id,
        phone_e164: phoneE164!,
        name: signupData.name.trim(),
        locale: 'sw',
        is_super_admin: false,
      });
      if (profileError) throw profileError;

      // Create membership for the user as OWNER
      const { error: membershipError } = await supabase.from('memberships').insert({
        tenant_id: tenant.id,
        user_id: userData.user.id,
        role: 'OWNER',
        active: true,
      });
      if (membershipError) throw membershipError;

      await supabase.auth.refreshSession();
      navigate('/onboarding/plan', { replace: true });
    } catch (err) {
      console.error('Signup error:', err);
      setError(t('onboarding.signup.error'));
      setBusy(false);
    }
  };

  return (
    <AuthCard subtitle={t('onboarding.signup.subtitle')}>
      {step === 'phone' && (
        <form onSubmit={(e) => void sendCode(e)} noValidate>
          <h1 className="mb-1 text-h1">{t('onboarding.signup.title')}</h1>
          <p className="mb-5 text-sm text-text-muted">{t('onboarding.signup.body')}</p>
          <PhoneInput
            label={t('phone.label')}
            value={phoneRaw}
            onChange={(raw, e164) => {
              setPhoneRaw(raw);
              setPhoneE164(e164);
            }}
            error={phoneTouched && !phoneE164 ? t('phone.errors.too_short') : (error ?? undefined)}
            required
            autoFocus
          />
          <Button type="submit" className="mt-2 w-full" loading={busy} loadingLabel={t('auth.sending_code')}>
            {t('auth.send_code')}
          </Button>
        </form>
      )}

      {step === 'code' && (
        <div>
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setError(null);
            }}
            className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <span>{t('auth.change_number')}</span>
          </button>
          <h1 className="mb-1 text-h1">{t('auth.enter_code_title')}</h1>
          <p className="mb-5 text-sm text-text-muted">
            {t('auth.enter_code_body', { phone: phoneE164 ? formatPhone(phoneE164) : '' })}
          </p>
          <CodeInput
            label={t('auth.code_label')}
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            onComplete={(v) => void verify(v)}
            error={error ?? undefined}
            disabled={busy}
            autoFocus
          />
          <Button
            type="button"
            className="mt-2 w-full"
            onClick={() => void verify(code)}
            loading={busy}
            loadingLabel={t('auth.verifying')}
            disabled={code.length < 6}
          >
            {t('auth.verify')}
          </Button>
          <Button
            type="button"
            variant="link"
            className="mt-3 w-full"
            onClick={(e) => void sendCode(e)}
            disabled={busy}
          >
            {t('auth.resend_code')}
          </Button>
        </div>
      )}

      {step === 'details' && (
        <form onSubmit={(e) => void submitDetails(e)} noValidate>
          <h1 className="mb-1 text-h1">{t('onboarding.signup.details_title')}</h1>
          <p className="mb-5 text-sm text-text-muted">{t('onboarding.signup.details_body')}</p>

          {error && (
            <div className="mb-4 flex items-center gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              {error}
            </div>
          )}

          <Field
            id="su-name"
            label={t('onboarding.signup.name')}
            required
            error={signupData.name && signupData.name.trim().length < 2 ? t('onboarding.signup.name_invalid') : undefined}
          >
            <Input
              id="su-name"
              value={signupData.name}
              onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
              autoFocus
            />
          </Field>

          <Field
            id="su-slug"
            label={t('onboarding.signup.slug')}
            required
            hint={t('onboarding.signup.slug_hint')}
            error={
              signupData.slug && !slugValid
                ? t('onboarding.signup.slug_invalid')
                : slugTaken
                  ? t('onboarding.signup.slug_taken')
                  : undefined
            }
          >
            <Input
              id="su-slug"
              value={signupData.slug}
              onChange={(e) => {
                setSignupData({ ...signupData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') });
                checkSlug();
              }}
              onBlur={checkSlug}
              invalid={Boolean((signupData.slug && !slugValid) || slugTaken)}
            />
          </Field>

          <Field id="su-city" label={t('onboarding.signup.city')}>
            <Input
              id="su-city"
              value={signupData.city}
              onChange={(e) => setSignupData({ ...signupData, city: e.target.value })}
            />
          </Field>

          <Field
            id="su-prefix"
            label={t('onboarding.signup.ticket_prefix')}
            required
            hint={t('onboarding.signup.ticket_prefix_hint')}
            error={
              signupData.ticketPrefix && !prefixValid
                ? t('onboarding.signup.ticket_prefix_invalid')
                : prefixTaken
                  ? t('onboarding.signup.ticket_prefix_taken')
                  : undefined
            }
          >
            <Input
              id="su-prefix"
              value={signupData.ticketPrefix}
              onChange={(e) => {
                setSignupData({
                  ...signupData,
                  ticketPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5),
                });
                checkPrefix();
              }}
              onBlur={checkPrefix}
              invalid={Boolean((signupData.ticketPrefix && !prefixValid) || prefixTaken)}
            />
          </Field>

          <Button type="submit" className="mt-4 w-full" loading={busy} disabled={!step2Ok}>
            {t('onboarding.signup.submit')}
          </Button>
        </form>
      )}

      {isSandbox && (
        <p className="mt-6 flex items-start gap-2 text-caption text-text-subtle">
          <SandboxBadge />
          <span>{t('auth.sandbox_hint')}</span>
        </p>
      )}

      <p className="mt-4 text-center text-sm text-text-muted">
        {t('onboarding.signup.already_have_account')} <Link to="/ops/login" className="text-primary hover:underline">{t('onboarding.signup.sign_in')}</Link>
      </p>
    </AuthCard>
  );
}