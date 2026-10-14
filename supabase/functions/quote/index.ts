// POST /functions/v1/quote — public, anonymous. Body: { slug, items, address? }
// Returns an itemised quote priced from the live catalog. Rate limited per IP.
import { adminClient } from '../_shared/admin-client.ts';
import { handleQuote } from '../_shared/handlers/quote.ts';
import { supabaseDeps } from '../_shared/handlers/supabase-deps.ts';
import { error, json, preflight } from '../_shared/http.ts';
import { log } from '../_shared/log.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return error('method_not_allowed', 'errors.internal', 405);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const result = await handleQuote(body, supabaseDeps(adminClient(), req));
  if (result.status >= 500) log.error('quote_failed', { status: result.status });
  return json(result.body, result.status);
});
