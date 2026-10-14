import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { SandboxBadge } from '@/components/shared/SandboxBadge';
import { formatDay } from '@/lib/dates';

/** Phase 0 placeholder. The real dashboard (needs-action panel, KPIs, recent tickets) is Phase 1. */
export default function OpsDashboard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'sw' ? 'sw' : 'en';
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: t('nav.overview') }, { label: t('nav.dashboard') }]}
        title={t('ops.dashboard_title')}
        subtitle={t('ops.dashboard_subtitle', { date: formatDay(new Date(), locale) })}
        badges={<SandboxBadge />}
      />
      <p className="text-text-muted" data-testid="foundation-notice">
        {t('ops.foundation_notice')}
      </p>
    </>
  );
}
