import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { authErrorKey, MIN_PASSWORD_LENGTH, signInWithPassword, SMS_AVAILABLE } from '@/lib/auth-api';

export interface PasswordSignInProps {
  /** Where "Forgot password?" returns the user: their login page and where to go after. */
  reset: { back: string; next: string };
  /** Runs after a successful sign-in, before the page's own redirect (e.g. claim an invite). */
  onSignedIn?: () => Promise<unknown>;
}

/**
 * Everyday sign-in for every staff shell: phone + password, no SMS. The page around it
 * redirects once AuthProvider reports the session.
 */
export function PasswordSignIn({ reset, onSignedIn }: PasswordSignInProps) {
  const { t } = useTranslation();
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneE164 || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(phoneE164, password);
      await onSignedIn?.();
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
      <PhoneInput
        label={t('phone.label')}
        value={phoneRaw}
        onChange={(raw, e164) => {
          setPhoneRaw(raw);
          setPhoneE164(e164);
          setError(null);
        }}
        error={touched && !phoneE164 ? t('phone.errors.too_short') : undefined}
        required
        autoFocus
      />
      <PasswordInput
        id="signin-password"
        label={t('auth.password_label')}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoComplete="current-password"
        error={
          error ??
          (touched && !password ? t('auth.password_too_short', { min: MIN_PASSWORD_LENGTH }) : undefined)
        }
      />
      {/* Reset needs an SMS code; hidden until the Briq sender ID is approved. */}
      {SMS_AVAILABLE && (
        <div className="flex justify-end">
          <Link to="/reset-password" state={reset} className="text-sm text-primary hover:underline">
            {t('auth.forgot_password')}
          </Link>
        </div>
      )}
      <Button type="submit" className="w-full" loading={busy} loadingLabel={t('auth.signing_in')}>
        {t('auth.sign_in')}
      </Button>
    </form>
  );
}
