import { ArrowLeft } from 'lucide-react';

import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CodeInput } from '@/components/shared/CodeInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { authErrorKey, requestOtp, verifyOtp } from '@/lib/auth-api';
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

  if (auth.status === 'signed_in' && auth.claims.tenant_role === 'CLEANER') {
    return <Navigate to={from} replace />;
  }

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
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
    } catch (err) {
      setError(t(authErrorKey(err as Error)));
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-surface-page p-4 text-text">
      <div className="mx-auto mt-10 max-w-sm rounded-xl border border-border bg-surface p-6 shadow-card">
        <h1 className="text-h1">{t('auth.sign_in_title')}</h1>
        <p className="mt-2 text-sm text-text-muted">{t('auth.field_sign_in_body')}</p>
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
              className="mb-3 inline-flex items-center gap-1 text-sm text-primary"
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
      </div>
    </main>
  );
}
