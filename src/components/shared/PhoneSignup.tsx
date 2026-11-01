import { ArrowLeft } from '@/components/ui/icons';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeInput } from '@/components/shared/CodeInput';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import {
  authErrorKey,
  MIN_PASSWORD_LENGTH,
  resendSignupCode,
  signUpWithPassword,
  verifyOtp,
} from '@/lib/auth-api';
import { formatPhone } from '@/lib/phone';

export interface PhoneSignupProps {
  title: string;
  body: string;
  /** Runs once the code is verified and the session exists (e.g. claim an invite). */
  onVerified?: () => Promise<unknown>;
}

/**
 * New account: phone + password, then the SMS code that proves the phone. Supabase only
 * signs the account in after the code, so a number cannot be claimed by someone else.
 */
export function PhoneSignup({ title, body, onVerified }: PhoneSignupProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<'account' | 'code'>('account');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordError =
    touched && password.length < MIN_PASSWORD_LENGTH
      ? t('auth.password_too_short', { min: MIN_PASSWORD_LENGTH })
      : undefined;
  const confirmError = touched && confirm !== password ? t('auth.password_mismatch') : undefined;

  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneE164 || password.length < MIN_PASSWORD_LENGTH || confirm !== password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signUpWithPassword(phoneE164, password);
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
      await onVerified?.();
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!phoneE164 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await resendSignupCode(phoneE164);
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            setStep('account');
            setError(null);
          }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('auth.change_number')}
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
          onClick={() => void resend()}
          disabled={busy}
        >
          {t('auth.resend_code')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void createAccount(e)} noValidate className="space-y-4">
      <div>
        <h1 className="mb-1 text-h1">{title}</h1>
        <p className="text-sm text-text-muted">{body}</p>
      </div>
      <PhoneInput
        label={t('phone.label')}
        value={phoneRaw}
        onChange={(raw, e164) => {
          setPhoneRaw(raw);
          setPhoneE164(e164);
          setError(null);
        }}
        error={touched && !phoneE164 ? t('phone.errors.too_short') : (error ?? undefined)}
        required
        autoFocus
      />
      <PasswordInput
        id="signup-password"
        label={t('auth.password_label')}
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={t('auth.password_hint', { min: MIN_PASSWORD_LENGTH })}
        error={passwordError}
      />
      <PasswordInput
        id="signup-confirm"
        label={t('auth.password_confirm_label')}
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        error={confirmError}
      />
      <Button type="submit" className="w-full" loading={busy} loadingLabel={t('auth.creating_account')}>
        {t('auth.create_account')}
      </Button>
    </form>
  );
}
