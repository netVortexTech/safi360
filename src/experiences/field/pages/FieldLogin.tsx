import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthCard } from '@/components/shared/AuthCard';
import { PasswordSignIn } from '@/components/shared/PasswordSignIn';
import { PhoneSignup } from '@/components/shared/PhoneSignup';
import { Button } from '@/components/ui/button';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { claimStaffInvite, refreshSessionClaims } from '@/lib/auth-api';

export default function FieldLogin() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/field';

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);

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

  // Signed in but not linked to a company yet: the account exists but the office has
  // not rostered them. Offer a retry in case they just added.
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

  return (
    <AuthCard subtitle={t('auth.field_app')}>
      {mode === 'signin' ? (
        <>
          <h1 className="text-h2">{t('auth.sign_in_title')}</h1>
          <p className="mb-6 mt-1.5 text-sm text-text-muted">{t('auth.field_sign_in_body')}</p>
          {/* If the office already rostered this phone, claiming links the account and
              grants the CLEANER membership; the refreshed session then shows their jobs. */}
          <PasswordSignIn reset={{ back: '/field/login', next: from }} onSignedIn={claimStaffInvite} />
          <p className="mt-4 text-center text-sm text-text-muted">
            {t('auth.new_cleaner')}{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => setMode('signup')}>
              {t('auth.create_account')}
            </button>
          </p>
        </>
      ) : (
        <>
          <PhoneSignup
            title={t('auth.field_signup_title')}
            body={t('auth.field_signup_body')}
            onVerified={claimStaffInvite}
          />
          <p className="mt-4 text-center text-sm text-text-muted">
            {t('auth.have_account')}{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => setMode('signin')}>
              {t('auth.sign_in')}
            </button>
          </p>
        </>
      )}
    </AuthCard>
  );
}
