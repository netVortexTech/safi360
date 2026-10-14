import { useTranslation } from 'react-i18next';
import { setPreferredLocale, type Locale } from '@/i18n';
import { cn } from '@/lib/utils';

export interface LanguageSwitchProps {
  locale: Locale;
  languages: readonly string[];
  className?: string;
}

/** sw / en toggle; the choice is saved as explicit so the experience default no longer applies. */
export function LanguageSwitch({ locale, languages, className }: LanguageSwitchProps) {
  const { t } = useTranslation();
  const options = (['sw', 'en'] as const).filter((l) => languages.includes(l));
  if (options.length < 2) return null;
  return (
    <div
      role="group"
      aria-label={t('portal.lang.switch')}
      className={cn('inline-flex rounded border border-brand-foreground/40 text-xs', className)}
    >
      {options.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setPreferredLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            'px-2 py-1 first:rounded-l last:rounded-r',
            locale === l
              ? 'bg-brand-foreground text-brand'
              : 'text-brand-foreground hover:bg-brand-foreground/10',
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
