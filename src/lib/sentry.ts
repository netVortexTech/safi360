// Optional Sentry error reporting. No-op when VITE_SENTRY_DSN is unset, so the
// app runs with zero overhead (and no @sentry/react bundle cost) in dev/CI.
let initialised = false;

interface SentryEvent {
  message?: unknown;
  exception?: { values?: { value?: unknown }[] };
}

/** Mask Tanzanian phones and emails before an event leaves the browser. */
function scrub(text: string): string {
  return text
    .replace(/\+255\d{9}/g, '+255XXX•••XXX')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
}

function scrubEvent(event: SentryEvent): SentryEvent {
  try {
    if (typeof event.message === 'string') event.message = scrub(event.message);
    const values = event.exception?.values;
    for (const v of values ?? []) {
      if (typeof v.value === 'string') v.value = scrub(v.value);
    }
  } catch {
    // Scrubbing must never break reporting.
  }
  return event;
}

/** Lazily initialise Sentry only when a DSN is configured. Safe to call twice. */
export async function initSentry(): Promise<void> {
  if (initialised) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  initialised = true;
  try {
    // Constructed at runtime + @vite-ignore so Rollup does not try to resolve
    // the optional dependency at build time; it is only fetched when a DSN is set.
    const specifier = ['@sentry', 'react'].join('/');
    const Sentry = (await import(/* @vite-ignore */ specifier)) as unknown as {
      init(options: {
        dsn: string;
        environment: string;
        beforeSend: (event: SentryEvent) => SentryEvent;
      }): void;
    };
    Sentry.init({
      dsn,
      environment: (import.meta.env.VITE_APP_ENV as string | undefined) ?? 'development',
      beforeSend: (event) => scrubEvent(event),
    });
  } catch {
    initialised = false;
  }
}
