import { ArrowLeft } from '@/components/ui/icons';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { CodeInput } from '@/components/shared/CodeInput';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authErrorKey, MIN_PASSWORD_LENGTH, requestOtp, updatePassword, verifyOtp } from '@/lib/auth-api';
import { formatPhone } from '@/lib/phone';

type Step = 'phone' | 'code' | 'password';

/** Only same-app paths, so a crafted link cannot send the user elsewhere. */
function safePath(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback;
}

/**
 * Forgot password: phone → SMS code (signs the user in) → new password. Its own route,
 * because the login pages redirect as soon as a session exists, which would skip the
 * new-password step.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const state = location.state as { back?: unknown; next?: unknown } | null;
  const back = safePath(state?.back, '/ops/login');
  const next = safePath(state?.next, '/ops');

  const [step, setStep] = useState<Step>('phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!phoneE164 || busy) return;
    void run(async () => {
      await requestOtp(phoneE164);
      setStep('code');
      setCode('');
      setTouched(false);
    });
  };

  const verify = (value: string) => {
    if (!phoneE164 || value.length < 6 || busy) return;
    void run(async () => {
      await verifyOtp(phoneE164, value);
      setStep('password');
    });
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < MIN_PASSWORD_LENGTH || confirm !== password || busy) return;
    void run(async () => {
      await updatePassword(password);
      toast({ title: t('reset.done') });
      navigate(next, { replace: true });
    });
  };

  return (
    <AuthCard>
      {step === 'phone' && (
        <form onSubmit={sendCode} noValidate className="space-y-4">
          <div>
            <h1 className="mb-1 text-h1">{t('reset.title')}</h1>
            <p className="text-sm text-text-muted">{t('reset.body')}</p>
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
          <Button type="submit" className="w-full" loading={busy} loadingLabel={t('auth.sending_code')}>
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
            onComplete={verify}
            error={error ?? undefined}
            disabled={busy}
            autoFocus
          />
          <Button
            type="button"
            className="mt-2 w-full"
            onClick={() => verify(code)}
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
            onClick={() => sendCode()}
            disabled={busy}
          >
            {t('auth.resend_code')}
          </Button>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={save} noValidate className="space-y-4">
          <div>
            <h1 className="mb-1 text-h1">{t('reset.new_title')}</h1>
            <p className="text-sm text-text-muted">{t('reset.new_body')}</p>
          </div>
          <PasswordInput
            id="reset-password"
            label={t('settings.password_new')}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            autoFocus
            hint={t('auth.password_hint', { min: MIN_PASSWORD_LENGTH })}
            error={
              error ??
              (touched && password.length < MIN_PASSWORD_LENGTH
                ? t('auth.password_too_short', { min: MIN_PASSWORD_LENGTH })
                : undefined)
            }
          />
          <PasswordInput
            id="reset-confirm"
            label={t('auth.password_confirm_label')}
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={touched && confirm !== password ? t('auth.password_mismatch') : undefined}
          />
          <Button type="submit" className="w-full" loading={busy}>
            {t('reset.submit')}
          </Button>
        </form>
      )}

      {step !== 'password' && (
        <p className="mt-4 text-center text-sm">
          <Link to={back} className="text-primary hover:underline">
            {t('reset.back_to_sign_in')}
          </Link>
        </p>
      )}
    </AuthCard>
  );
}
