// Map data-layer failures to i18n keys. The raw message never reaches the UI.

interface PostgrestLike {
  code?: string;
  message?: string;
  status?: number;
}

/** PostgREST errors are plain objects in some paths; always throw a real Error that keeps code/message. */
export function asError(err: unknown): Error {
  if (err instanceof Error) return err;
  const e = (err ?? {}) as PostgrestLike;
  return Object.assign(new Error(e.message ?? 'request_failed'), e);
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** i18n key describing what went wrong, for ErrorState / toasts. */
export function errorKey(err: unknown): string {
  if (isOffline()) return 'errors.offline_body';
  const e = (err ?? {}) as PostgrestLike;
  switch (e.code) {
    case '23505':
      return 'errors.duplicate';
    case '23503':
      return 'errors.in_use';
    case '42501':
    case 'PGRST301':
      return 'errors.forbidden';
    case '23514':
      return 'errors.invalid_data';
  }
  if (e.status === 401 || e.status === 403) return 'errors.forbidden';
  if (/row-level security/i.test(e.message ?? '')) return 'errors.forbidden';
  return 'errors.generic_body';
}
