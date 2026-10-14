// Response helpers for Edge Functions: consistent JSON envelopes, CORS and error mapping.
import { z } from 'zod';
import { type ApiError, toFieldErrors } from './schemas.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

export function error(code: string, message: string, status: number, opts: Partial<ApiError> = {}): Response {
  const body: ApiError = { code, message, retryable: false, ...opts };
  return json(body, status);
}

/** Map any thrown value to an error response without leaking internals. */
export function handleError(err: unknown): Response {
  if (err instanceof z.ZodError) {
    return error('validation_failed', 'validation.failed', 422, { field_errors: toFieldErrors(err) });
  }
  if (err instanceof Error) {
    switch (err.message) {
      case 'tenant_not_found':
        return error('tenant_not_found', 'errors.tenant_not_found', 404);
      case 'tenant_suspended':
        return error('tenant_suspended', 'errors.tenant_suspended', 403);
      case 'rate_limited':
        return error('rate_limited', 'errors.rate_limited', 429, { retryable: true });
    }
  }
  console.error('unhandled_error', err instanceof Error ? err.message : 'unknown');
  return error('internal', 'errors.internal', 500, { retryable: true });
}

/** Parse and validate a JSON body against a schema. */
export async function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new z.ZodError([{ code: 'custom', path: ['_root'], message: 'validation.body.invalid_json' }]);
  }
  return schema.parse(raw);
}
