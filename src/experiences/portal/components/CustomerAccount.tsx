import { CheckCircle2 } from '@/components/ui/icons';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { PasswordInput } from '@/components/shared/PasswordInput';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth-api';
import { formatPhone } from '@/lib/phone';
import { portalApi, portalErrorKey } from '../api';
import type { TrackingVerifyResponse } from '../types';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface CustomerAccountProps {
  slug: string;
  locale: 'sw' | 'en';
  phoneRaw: string;
  phoneE164: string | null;
  onPhoneChange: (raw: string, e164: string | null) => void;
  /** When set, this phone is signed in; shows the signed-in state. */
  verifiedPhone?: string | null | undefined;
  onAuthenticated: (result: TrackingVerifyResponse & { phone: string }) => void;
  /**
   * Name and email for a new account. The booking form collects them itself and passes
   * them in; when omitted (Track my booking) the signup form shows its own fields.
   */
  profile?: { name: string; email: string } | undefined;
  /** Tracking: also find this ticket among the client's bookings. */
  ticketRef?: string | undefined;
  /** Extra fields above the phone (e.g. the ticket number on tracking). */
  before?: ReactNode;
  autoFocus?: boolean | undefined;
}

/**
 * Client sign-in / sign-up at one business: phone + password (+ optional email). Stands in
 * for the SMS code step while the Briq sender ID is pending; the customer_auth function
 * returns the same token, so booking and tracking work unchanged.
 */
export function CustomerAccount({
  slug,
  locale,
  phoneRaw,
  phoneE164,
  onPhoneChange,
  verifiedPhone,
  onAuthenticated,
  profile,
  ticketRef,
  before,
  autoFocus,
}: CustomerAccountProps) {
  const { t } = useTranslation();
  const id = useId();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ownName, setOwnName] = useState('');
  const [ownEmail, setOwnEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (verifiedPhone != null && verifiedPhone === phoneE164) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-tint/40 p-3 text-sm"
        data-testid="account-signed-in"
      >
        <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
        <span className="text-text">
          {t('portal.account.signed_in_as')} <span className="tabular">{formatPhone(verifiedPhone)}</span>
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

  const name = (profile?.name ?? ownName).trim();
  const email = (profile?.email ?? ownEmail).trim();
  const signup = mode === 'signup';
  const passwordShort = password.length < MIN_PASSWORD_LENGTH;
  const mismatch = signup && confirm !== password;
  const emailBad = signup && email !== '' && !EMAIL.test(email);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!phoneE164 || passwordShort || mismatch || emailBad || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ticket = ticketRef ? { ticket_ref: ticketRef } : {};
      const res = signup
        ? await portalApi.customerAuth({
            action: 'signup',
            slug,
            phone: phoneE164,
            password,
            locale,
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...ticket,
          })
        : await portalApi.customerAuth({ action: 'login', slug, phone: phoneE164, password, ...ticket });
      setPassword('');
      setConfirm('');
      onAuthenticated({ ...res, phone: phoneE164 });
    } catch (err) {
      setError(t(portalErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4" data-testid={`account-${mode}`}>
      <div>
        <h3 className="text-h3">
          {t(signup ? 'portal.account.title_signup' : 'portal.account.title_login')}
        </h3>
        <p className="text-sm text-text-muted">{t('portal.account.body')}</p>
      </div>
      {before}
      {signup && !profile && (
        <>
          <Field id={`${id}-name`} label={t('portal.contact.name')} required>
            <Input
              id={`${id}-name`}
              value={ownName}
              onChange={(e) => setOwnName(e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Field
            id={`${id}-email`}
            label={t('auth.email_optional_label')}
            error={touched && emailBad ? t('auth.email_invalid') : undefined}
          >
            <Input
              id={`${id}-email`}
              type="email"
              value={ownEmail}
              onChange={(e) => setOwnEmail(e.target.value)}
              autoComplete="email"
              invalid={touched && emailBad}
            />
          </Field>
        </>
      )}
      <PhoneInput
        label={t('portal.contact.phone')}
        value={phoneRaw}
        onChange={(raw, e164) => {
          onPhoneChange(raw, e164);
          setError(null);
        }}
        error={touched && !phoneE164 ? t('phone.errors.too_short') : undefined}
        required
        autoFocus={autoFocus ?? false}
      />
      <PasswordInput
        id={`${id}-password`}
        label={t('auth.password_label')}
        value={password}
        onChange={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoComplete={signup ? 'new-password' : 'current-password'}
        hint={signup ? t('auth.password_hint', { min: MIN_PASSWORD_LENGTH }) : undefined}
        error={
          error ??
          (touched && passwordShort ? t('auth.password_too_short', { min: MIN_PASSWORD_LENGTH }) : undefined)
        }
      />
      {signup && (
        <PasswordInput
          id={`${id}-confirm`}
          label={t('auth.password_confirm_label')}
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          error={touched && mismatch ? t('auth.password_mismatch') : undefined}
        />
      )}
      <Button
        type="submit"
        className="w-full"
        loading={busy}
        loadingLabel={t(signup ? 'auth.creating_account' : 'auth.signing_in')}
      >
        {t(signup ? 'auth.create_account' : 'auth.sign_in')}
      </Button>
      <p className="text-center text-sm text-text-muted">
        {t(signup ? 'auth.have_account' : 'portal.account.new_here')}{' '}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => {
            setMode(signup ? 'login' : 'signup');
            setError(null);
            setTouched(false);
          }}
        >
          {t(signup ? 'auth.sign_in' : 'auth.create_account')}
        </button>
      </p>
    </form>
  );
}
