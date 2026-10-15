import { ArrowLeft } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { CodeInput } from '@/components/shared/CodeInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { SandboxBadge } from '@/components/shared/SandboxBadge';
import { Button } from '@/components/ui/button';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { authErrorKey, requestOtp, verifyOtp } from '@/lib/auth-api';
import { isSandbox } from '@/lib/env';
import { formatPhone } from '@/lib/phone';

type Step = 'phone' | 'code';

/** Control-center sign-in: same phone-OTP flow as ops, but requires a super-admin account. */
export default function ControlLogin() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/control';

  const [step, setStep] = useState<Step>('phone');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  if (auth.status === 'signed_in') {
    if (auth.claims.is_super_admin) return <Navigate to={from} replace />;
    return <Navigate to="/control" replace />;
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setPhoneTouched(true);
    if (!phoneE164) return;
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phoneE164);
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
      // AuthProvider picks up the session; the Navigate above takes over.
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-page p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-card">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded bg-primary text-lg font-bold text-primary-foreground">
            S
          </span>
          <div>
            <div className="text-base font-semibold">{t('app.name')}</div>
            <div className="text-xs text-text-subtle">{t('control.title')}</div>
          </div>
        </div>

        {step === 'phone' ? (
          <form onSubmit={(e) => void sendCode(e)} noValidate>
            <h1 className="mb-1 text-h1">{t('auth.sign_in_title')}</h1>
            <p className="mb-5 text-sm text-text-muted">{t('control.login_body')}</p>
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
            <Button
              type="submit"
              className="mt-2 w-full"
              loading={busy}
              loadingLabel={t('auth.sending_code')}
            >
              {t('auth.send_code')}
            </Button>
          </form>
        ) : (
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

        {isSandbox && (
          <p className="mt-6 flex items-start gap-2 text-xs text-text-subtle">
            <SandboxBadge />
            <span>{t('auth.sandbox_hint')}</span>
          </p>
        )}
      </div>
    </main>
  );
}
