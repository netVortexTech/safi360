import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  authErrorKey,
  MIN_PASSWORD_LENGTH,
  signUpWithPassword,
} from '@/lib/auth-api';
import { formatPhone } from '@/lib/phone';

export interface PhoneSignupProps {
  title: string;
  body: string;
  /** Runs once the code is verified and the session exists (e.g. claim an invite). */
  onVerified?: () => Promise<unknown>;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * New account: phone + password + optional email. Account is created immediately
 * (phone confirmations are off until Briq approves our SMS sender ID). No code
 * verification required at signup.
 */
export function PhoneSignup({ title, body, onVerified }: PhoneSignupProps) {
  const { t } = useTranslation();
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const passwordError =
    touched && password.length < MIN_PASSWORD_LENGTH
      ? t('auth.password_too_short', { min: MIN_PASSWORD_LENGTH })
      : undefined;
  const confirmError = touched && confirm !== password ? t('auth.password_mismatch') : undefined;
  const emailValid = email.trim() === '' || EMAIL_RE.test(email.trim());
  const emailError = touched && !emailValid ? t('auth.email_invalid') : undefined;

  const createAccount = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneE164 || password.length < MIN_PASSWORD_LENGTH || confirm !== password || !emailValid || busy)
      return;
    setBusy(true);
    setError(null);
    try {
      await signUpWithPassword(phoneE164, password, email.trim() || undefined);
      await onVerified?.();
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={createAccount} noValidate className="space-y-4">
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
      <Field
        id="signup-email"
        label={t('auth.email_optional_label')}
        hint={t('auth.email_hint')}
        error={emailError}
      >
        <Input
          id="signup-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(emailError)}
        />
      </Field>
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
