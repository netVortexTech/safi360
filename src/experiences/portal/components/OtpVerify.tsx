import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CodeInput } from '@/components/shared/CodeInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { SandboxBadge } from '@/components/shared/SandboxBadge';
import { Button } from '@/components/ui/button';
import { formatPhone } from '@/lib/phone';
import { isPortalApiError, portalErrorKey } from '../api';
import { useOtpSend, useOtpVerify } from '../hooks';

export interface OtpVerifyProps {
  slug: string;
  purpose: 'booking' | 'tracking';
  locale: 'sw' | 'en';
  phoneRaw: string;
  phoneE164: string | null;
  onPhoneChange: (raw: string, e164: string | null) => void;
  /** When set, the phone is already proven; shows the verified state. */
  verifiedPhone?: string | null | undefined;
  onVerified: (result: { phone: string; token: string; expires_at: string }) => void;
  /** Extra fields rendered above the phone (e.g. ticket number on tracking). */
  before?: React.ReactNode;
  /** Render the phone step's primary button label. */
  sendLabel?: string | undefined;
  /** Tracking: the start call happens upstream; this component only verifies. */
  onSend?: ((phone: string) => Promise<{ sandbox?: boolean }>) | undefined;
  /** Tracking: verify through tracking_verify instead of otp_verify. */
  onVerify?: ((phone: string, code: string) => Promise<{ token: string; expires_at: string }>) | undefined;
  autoFocus?: boolean | undefined;
}

type Stage = 'phone' | 'code';

/** Phone → 6-digit code → token. Shared by the booking contact step and Track my booking. */
export function OtpVerify({
  slug,
  purpose,
  locale,
  phoneRaw,
  phoneE164,
  onPhoneChange,
  verifiedPhone,
  onVerified,
  before,
  sendLabel,
  onSend,
  onVerify,
  autoFocus,
}: OtpVerifyProps) {
  const { t } = useTranslation();
  const send = useOtpSend();
  const verify = useOtpVerify();
  const [stage, setStage] = useState<Stage>('phone');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sandbox, setSandbox] = useState(false);
  const [busy, setBusy] = useState(false);

  const verified = verifiedPhone != null && verifiedPhone === phoneE164;

  const doSend = async (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!phoneE164) return;
    setBusy(true);
    setError(null);
    try {
      const res = onSend
        ? await onSend(phoneE164)
        : await send.mutateAsync({ slug, phone: phoneE164, purpose, locale });
      setSandbox(res.sandbox === true);
      setCode('');
      setStage('code');
    } catch (err) {
      setError(t(portalErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async (value: string) => {
    if (!phoneE164 || value.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = onVerify
        ? await onVerify(phoneE164, value)
        : await verify.mutateAsync({ slug, phone: phoneE164, purpose, code: value });
      onVerified({ phone: phoneE164, token: res.token, expires_at: res.expires_at });
      setStage('phone');
    } catch (err) {
      const key = isPortalApiError(err) && err.fieldErrors.code ? err.fieldErrors.code : portalErrorKey(err);
      setError(t(key));
    } finally {
      setBusy(false);
    }
  };

  if (verified) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-tint/40 p-3 text-sm"
        data-testid="otp-verified"
      >
        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        <span className="text-text">
          {t('portal.contact.verified')} · <span className="tabular">{formatPhone(verifiedPhone)}</span>
        </span>
        <button
          type="button"
          className="ml-auto text-primary hover:underline"
          onClick={() => onPhoneChange('', null)}
        >
          {t('portal.contact.change_number')}
        </button>
      </div>
    );
  }

  if (stage === 'code' && phoneE164) {
    return (
      <div data-testid="otp-code">
        <button
          type="button"
          onClick={() => {
            setStage('phone');
            setError(null);
          }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t('portal.contact.change_number')}
        </button>
        <h3 className="text-h3">
          {t(purpose === 'tracking' ? 'portal.track.code_title' : 'portal.contact.verify_title')}
        </h3>
        <p className="mb-4 text-sm text-text-muted">
          {t(purpose === 'tracking' ? 'portal.track.code_body' : 'portal.contact.verify_body', {
            phone: formatPhone(phoneE164),
          })}
        </p>
        <CodeInput
          label={t('portal.contact.code_label')}
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          onComplete={(v) => void doVerify(v)}
          error={error ?? undefined}
          disabled={busy}
          autoFocus
        />
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => void doVerify(code)}
          loading={busy}
          loadingLabel={t('portal.contact.verifying')}
          disabled={code.length < 6}
        >
          {t('portal.contact.verify')}
        </Button>
        <Button
          type="button"
          variant="link"
          className="mt-2 w-full"
          onClick={() => void doSend()}
          disabled={busy}
        >
          {t('portal.contact.resend')}
        </Button>
        {sandbox && (
          <p className="mt-4 flex items-start gap-2 text-xs text-text-subtle">
            <SandboxBadge />
            <span>{t('portal.contact.sandbox_hint')}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void doSend(e)} noValidate data-testid="otp-phone">
      {before}
      <PhoneInput
        label={t('portal.contact.phone')}
        value={phoneRaw}
        onChange={onPhoneChange}
        error={touched && !phoneE164 ? t('phone.errors.too_short') : (error ?? undefined)}
        required
        autoFocus={autoFocus ?? false}
      />
      <Button type="submit" className="mt-2 w-full" loading={busy} loadingLabel={t('portal.contact.sending')}>
        {sendLabel ?? t('portal.contact.send_code')}
      </Button>
    </form>
  );
}
