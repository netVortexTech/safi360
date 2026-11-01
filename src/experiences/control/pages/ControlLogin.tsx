import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { PasswordSignIn } from '@/components/shared/PasswordSignIn';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';

/** Control-center sign-in: same phone + password form as ops, but requires a super-admin account. */
export default function ControlLogin() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/control';

  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  if (auth.status === 'signed_in') {
    if (auth.claims.is_super_admin) return <Navigate to={from} replace />;
    return <Navigate to="/control" replace />;
  }

  return (
    <AuthCard subtitle={t('control.title')}>
      <h1 className="mb-1 text-h1">{t('auth.sign_in_title')}</h1>
      <p className="mb-5 text-sm text-text-muted">{t('control.login_body')}</p>
      <PasswordSignIn reset={{ back: '/control/login', next: from }} />
    </AuthCard>
  );
}
