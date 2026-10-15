import { useTranslation } from 'react-i18next';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Public privacy notice. No auth required — linked from the portal footer.
 * All copy comes from `privacy.*` i18n keys.
 */
export default function PrivacyPage() {
  const { t } = useTranslation();
  const sections = ['collect', 'use', 'rights', 'contact'] as const;

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="privacy-page">
      <header>
        <h1 className="text-h1">{t('privacy.title')}</h1>
        <p className="text-sm text-text-muted">{t('privacy.intro')}</p>
      </header>
      {sections.map((section) => (
        <Card key={section}>
          <CardHeader>
            <CardTitle>{t(`privacy.${section}.title`)}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-text-muted">{t(`privacy.${section}.body`)}</p>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
