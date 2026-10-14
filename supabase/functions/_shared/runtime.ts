// Deno entrypoint plumbing shared by every public function: CORS preflight, POST only,
// JSON body, service-role client, dependency wiring, structured error logging.
// Deno-only (uses Deno.serve / Deno.env); never imported by the Vitest suites.
import { adminClient } from './admin-client.ts';
import { bookingDeps, supabaseDeps, type FunctionEnv } from './handlers/supabase-deps.ts';
import type { BookingDeps, HandlerResult, PublicDeps } from './handlers/types.ts';
import { error, json, preflight } from './http.ts';
import { log } from './log.ts';

type PublicHandler = (body: unknown, deps: PublicDeps) => Promise<HandlerResult>;
type BookingHandler = (body: unknown, deps: BookingDeps) => Promise<HandlerResult>;

function readEnv(): FunctionEnv {
  return {
    APP_ENV: Deno.env.get('APP_ENV'),
    OTP_TOKEN_SECRET: Deno.env.get('OTP_TOKEN_SECRET'),
    OTP_PROVIDER: Deno.env.get('OTP_PROVIDER'),
    PAYMENT_PROVIDER: Deno.env.get('PAYMENT_PROVIDER'),
    MOCK_PAYMENT_SECRET: Deno.env.get('MOCK_PAYMENT_SECRET'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    LOAD_TEST_SECRET: Deno.env.get('LOAD_TEST_SECRET'),
  };
}

async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function serve(name: string, run: (req: Request, body: unknown) => Promise<HandlerResult>): void {
  Deno.serve(async (req: Request) => {
    const pre = preflight(req);
    if (pre) return pre;
    if (req.method !== 'POST') return error('method_not_allowed', 'errors.internal', 405);
    const body = await readBody(req);
    try {
      const result = await run(req, body);
      if (result.status >= 500) log.error(`${name}_failed`, { status: result.status });
      return json(result.body, result.status);
    } catch (err) {
      log.error(`${name}_crashed`, { message: err instanceof Error ? err.message : 'unknown' });
      return error('internal', 'errors.internal', 500, { retryable: true });
    }
  });
}

/** quote / availability: catalog + staff reads only. */
export function servePublic(name: string, handler: PublicHandler): void {
  serve(name, (req, body) => handler(body, supabaseDeps(adminClient(), req)));
}

/** Everything that touches bookings, OTPs or payments. */
export function serveBooking(name: string, handler: BookingHandler): void {
  serve(name, (req, body) => handler(body, bookingDeps(adminClient(), req, readEnv())));
}
