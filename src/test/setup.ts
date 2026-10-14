import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { initI18n, LOCALE_STORAGE_KEY } from '@/i18n';

// Tests run with the English catalogue so assertions read naturally; the Swahili
// catalogue is covered by the key-parity test. The saved preference makes English an
// explicit choice so experience defaults (Swahili on portal/field) do not flip it.
window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');
initI18n('en');
void import('i18next').then(({ default: i18next }) => i18next.changeLanguage('en'));

// Environment the lib/env schema expects; never real credentials.
vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('VITE_APP_ENV', 'development');

// jsdom supplies AbortController while Request comes from Node (undici); undici rejects
// jsdom's AbortSignal. React Router's data router builds a Request on every navigation,
// so drop a foreign signal instead of failing the navigation. No loaders use it here.
{
  const NodeRequest = globalThis.Request;
  class CompatRequest extends NodeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      try {
        super(input, init);
      } catch (err) {
        if (init?.signal && err instanceof TypeError && /signal/i.test(err.message)) {
          const { signal: _signal, ...rest } = init;
          super(input, rest);
        } else {
          throw err;
        }
      }
    }
  }
  globalThis.Request = CompatRequest;
}

// jsdom has no ResizeObserver; Radix (Switch, Dialog) expects one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

afterEach(() => {
  cleanup();
});
