// POST /functions/v1/availability — public, anonymous.
// Body: { slug, items, from, to, address? } → open slots for that job. Rate limited per IP.
import { adminClient } from '../_shared/admin-client.ts';
import { handleAvailability } from '../_shared/handlers/availability.ts';
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

  const result = await handleAvailability(body, supabaseDeps(adminClient(), req));
  if (result.status >= 500) log.error('availability_failed', { status: result.status });
  return json(result.body, result.status);
});
