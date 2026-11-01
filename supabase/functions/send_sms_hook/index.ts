// POST /functions/v1/send_sms_hook — called by Supabase Auth only (Send SMS hook), never by
// browsers. Delivers staff sign-in codes through Briq. Auth is the Standard Webhooks
// signature (SEND_SMS_HOOK_SECRET), not a Supabase JWT, so verify_jwt is off in config.toml.
import { handleSendSmsHook } from '../_shared/handlers/send-sms-hook.ts';
import { log } from '../_shared/log.ts';
import { smsProviderFromEnv } from '../_shared/sms/provider.ts';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const rawBody = await req.text();
  const result = await handleSendSmsHook(rawBody, req.headers, {
    secret: Deno.env.get('SEND_SMS_HOOK_SECRET'),
    sms: smsProviderFromEnv({
      OTP_PROVIDER: 'briq',
      BRIQ_API_KEY: Deno.env.get('BRIQ_API_KEY'),
      BRIQ_SENDER_ID: Deno.env.get('BRIQ_SENDER_ID'),
    }),
    now: () => new Date(),
  });
  if (result.status >= 400) log.error('send_sms_hook_failed', { status: result.status, body: result.body });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
