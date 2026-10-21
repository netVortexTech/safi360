import { ArrowLeft } from '@/components/ui/icons';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/shared/AuthCard';
import { CodeInput } from '@/components/shared/CodeInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { authErrorKey, claimStaffInvite, refreshSessionClaims, requestOtp, verifyOtp } from '@/lib/auth-api';
import { formatPhone } from '@/lib/phone';

export default function FieldLogin() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/field';

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phoneRaw, setRaw] = useState('');
  const [phoneE164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    applyExperienceLocale('sw');
  }, []);

  // On the "no company yet" screen, re-mint the token once on mount so access the office
  // granted since the last login shows up by simply reopening the app — no sign-out needed.
  const retriedRef = useRef(false);
  useEffect(() => {
    if (auth.status !== 'signed_in' || auth.claims.tenant_role === 'CLEANER') return;
    if (retriedRef.current) return;
    retriedRef.current = true;
    void refreshSessionClaims();
  }, [auth.status, auth.claims.tenant_role]);

  // Defined before the early returns so the "pending" screen can retry claiming an
  // invite the office may have added after this account first signed in.
  const checkAgain = async () => {
    setBusy(true);
    try {
      await claimStaffInvite();
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === 'signed_in' && auth.claims.tenant_role === 'CLEANER') {
    return <Navigate to={from} replace />;
  }

  // Signed in but not linked to a company yet: the account exists (created on first
  // login) but the office has not rostered them. Offer a retry in case they just added.
  if (auth.status === 'signed_in') {
    return (
      <AuthCard subtitle={t('auth.field_app')}>
        {' '}
        <h1 className="text-h2">{t('auth.no_access_title')}</h1>
        <p className="mt-2 text-sm text-text-muted">{t('auth.no_access_body')}</p>
        <p className="mt-2 text-sm text-text-muted">{t('auth.field_pending_hint')}</p>
        <Button className="mt-6 w-full" loading={busy} onClick={() => void checkAgain()}>
          {t('auth.check_again')}
        </Button>
        <Button variant="secondary" className="mt-2 w-full" onClick={() => void auth.signOut()}>
          {t('auth.sign_out')}
        </Button>
      </AuthCard>
    );
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneE164) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phoneE164, { shouldCreateUser: true });
      setStep('code');
      setCode('');
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value: string) => {
    if (!phoneE164 || value.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(phoneE164, value);
      // If the office already rostered this phone, this links the account and grants
      // the CLEANER membership; the refreshed session then shows their jobs.
      await claimStaffInvite();
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard subtitle={t('auth.field_app')}>
      <h1 className="text-h2">{t('auth.sign_in_title')}</h1>
      <p className="mt-1.5 text-sm text-text-muted">{t('auth.field_sign_in_body')}</p>
      {step === 'phone' ? (
        <form onSubmit={(e) => void sendCode(e)} noValidate className="mt-6 space-y-4">
          <PhoneInput
            label={t('phone.label')}
            value={phoneRaw}
            onChange={(raw, e164) => {
              setRaw(raw);
              setE164(e164);
            }}
            error={touched && !phoneE164 ? t('phone.errors.too_short') : (error ?? undefined)}
            required
            autoFocus
          />
          <Button type="submit" className="w-full" loading={busy} loadingLabel={t('auth.sending_code')}>
            {t('auth.send_code')}
          </Button>
        </form>
      ) : (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setError(null);
            }}
            className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden="true" /> {t('auth.change_number')}
          </button>
          <p className="mb-4 text-sm text-text-muted">
            {t('auth.enter_code_body', { phone: phoneE164 ? formatPhone(phoneE164) : '' })}
          </p>
          <CodeInput
            label={t('auth.code_label')}
            value={code}
            onChange={setCode}
            onComplete={(v) => void verify(v)}
            error={error ?? undefined}
            disabled={busy}
            autoFocus
          />
          <Button
            type="button"
            className="mt-3 w-full"
            onClick={() => void verify(code)}
            loading={busy}
            loadingLabel={t('auth.verifying')}
            disabled={code.length < 6}
          >
            {t('auth.verify')}
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
