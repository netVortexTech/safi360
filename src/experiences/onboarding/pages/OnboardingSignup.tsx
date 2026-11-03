import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthCard } from '@/components/shared/AuthCard';
import { PhoneSignup } from '@/components/shared/PhoneSignup';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/**
 * Self-serve company signup: phone + password + optional email. The company,
 * the owner's profile and the OWNER membership are created server-side automatically
 * during account creation (signUpWithPassword), not through an extra manual step.
 * The phone is verified by the optional SMS code if enabled.
 */
export default function OnboardingSignup() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();

  // Once a session exists, the tenant claims should be present from the access-token hook
  // No manual company details form needed - everything is created during signup.
  if (auth.status === 'signed_in' && auth.claims.tenant_id) {
    return <Navigate to="/onboarding/plan" replace />;
  }

  return (
    <AuthCard subtitle={t('onboarding.signup.subtitle')}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {t('onboarding.step', { current: 1, total: 3 })}
      </p>
      <PhoneSignup
        title={t('onboarding.signup.title')}
        body={t('onboarding/signup.body')}
        onVerified={() =>
          supabase.auth.refreshSession().then(() => {
            navigate('/onboarding/plan', { replace: true });
          })
        }
      />

      <p className="mt-4 text-center text-sm text-text-muted">
        {t('onboarding/signup.already_have_account')}{' '}
        <Link to="/ops/login" className="text-primary hover:underline">
          {t('onboarding/signup.sign_in')}
        </Link>
      </p>
    </AuthCard>
  );
}