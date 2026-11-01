import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { PasswordSignIn } from '@/components/shared/PasswordSignIn';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';

/** Staff sign-in: phone + password. Cleaners use the same form inside /field. */
export default function OpsLogin() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/ops';

  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  if (auth.status === 'signed_in') return <Navigate to={from} replace />;

  return (
    <AuthCard subtitle={t('auth.ops_subtitle')}>
      <h1 className="mb-1 text-h1">{t('auth.sign_in_title')}</h1>
      <p className="mb-5 text-sm text-text-muted">{t('auth.sign_in_body')}</p>
      <PasswordSignIn reset={{ back: '/ops/login', next: from }} />

      <p className="mt-4 text-center text-sm text-text-muted">
        {t('auth.new_here')}{' '}
        <Link to="/signup" className="text-primary hover:underline">
          {t('auth.create_company')}
        </Link>
      </p>
    </AuthCard>
  );
}
