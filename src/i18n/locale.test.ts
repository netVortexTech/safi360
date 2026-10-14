import i18next from 'i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyExperienceLocale, hasExplicitLocale, LOCALE_STORAGE_KEY, setPreferredLocale } from '@/i18n';

describe('experience locale defaults', () => {
  const originalUrl = window.location.href;

  beforeEach(async () => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    window.history.replaceState(null, '', '/usafi-bora');
    await i18next.changeLanguage('en');
  });

  afterEach(async () => {
    window.history.replaceState(null, '', originalUrl);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
    await i18next.changeLanguage('en');
  });

  it('reports no explicit choice when neither ?lang= nor a saved preference exists', () => {
    expect(hasExplicitLocale()).toBe(false);
  });

  it('applies the experience default when the visitor has not chosen', async () => {
    applyExperienceLocale('sw');
    await new Promise((r) => setTimeout(r, 0));
    expect(i18next.resolvedLanguage).toBe('sw');
    // Defaults are never persisted.
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it('keeps a saved preference over the experience default', async () => {
    setPreferredLocale('en');
    applyExperienceLocale('sw');
    await new Promise((r) => setTimeout(r, 0));
    expect(hasExplicitLocale()).toBe(true);
    expect(i18next.resolvedLanguage).toBe('en');
  });

  it('treats ?lang= as an explicit choice', () => {
    window.history.replaceState(null, '', '/usafi-bora?lang=en');
    expect(hasExplicitLocale()).toBe(true);
    applyExperienceLocale('sw');
    expect(i18next.resolvedLanguage).toBe('en');
  });

  it('ignores unsupported values', () => {
    window.history.replaceState(null, '', '/usafi-bora?lang=fr');
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'de');
    expect(hasExplicitLocale()).toBe(false);
  });
});
