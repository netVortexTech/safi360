import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import sw from './sw.json';

export const SUPPORTED_LOCALES = ['sw', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** localStorage key holding a language the visitor chose explicitly. */
export const LOCALE_STORAGE_KEY = 'safi360.locale';
const LOCALE_QUERY_KEY = 'lang';

export const resources = {
  sw: { translation: sw },
  en: { translation: en },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function readQueryLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const value = new URLSearchParams(window.location.search).get(LOCALE_QUERY_KEY);
  return isLocale(value) ? value : null;
}

function readSavedLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * True when the visitor chose a language explicitly: `?lang=` on the URL or a saved
 * preference. Browser language is deliberately NOT consulted — each experience has a
 * product default (Swahili on the portal and field app, English on ops and control)
 * that must not be overridden by an English-locale phone.
 */
export function hasExplicitLocale(): boolean {
  return readQueryLocale() !== null || readSavedLocale() !== null;
}

/** Persist an explicit choice (language switcher, `?lang=`) and switch to it. */
export function setPreferredLocale(locale: Locale) {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Private mode / blocked storage: the choice still applies for this page load.
  }
  if (i18next.resolvedLanguage !== locale) void i18next.changeLanguage(locale);
}

/**
 * Apply an experience's default language unless the visitor chose one explicitly.
 * Never persisted, so visiting /ops (English) does not flip the same browser's
 * customer portal (Swahili) later.
 */
export function applyExperienceLocale(locale: Locale) {
  if (hasExplicitLocale()) return;
  if (i18next.resolvedLanguage !== locale) void i18next.changeLanguage(locale);
}

/**
 * Initialise once for the whole app. Detection order is query string → saved
 * preference → `defaultLocale`; layouts then call `applyExperienceLocale` with their own
 * default. Defaults are never written to storage; only explicit choices are.
 */
export function initI18n(defaultLocale: Locale = 'sw') {
  if (i18next.isInitialized) return i18next;
  void i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: defaultLocale,
      supportedLngs: [...SUPPORTED_LOCALES],
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      detection: {
        order: ['querystring', 'localStorage'],
        lookupQuerystring: LOCALE_QUERY_KEY,
        lookupLocalStorage: LOCALE_STORAGE_KEY,
        caches: [],
      },
      returnNull: false,
    });
  // `?lang=` is an explicit choice: remember it like a language-switcher click.
  const fromQuery = readQueryLocale();
  if (fromQuery) setPreferredLocale(fromQuery);
  return i18next;
}

export { i18next };
