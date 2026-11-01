import { describe, expect, it, vi } from 'vitest';
import type { SmsProvider } from '../sms/provider.ts';
import { handleSendSmsHook } from './send-sms-hook.ts';

const KEY_B64 = btoa('a-thirty-two-byte-test-secret-!!');
const SECRET = `v1,whsec_${KEY_B64}`;
const NOW = new Date('2026-11-01T12:00:00Z');
const BODY = JSON.stringify({ user: { phone: '255763594105' }, sms: { otp: '482913' } });

async function sign(body: string, ts: number, id = 'msg_1'): Promise<Headers> {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(KEY_B64), (c) => c.charCodeAt(0)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)),
  );
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': String(ts),
    'webhook-signature': `v1,${btoa(String.fromCharCode(...mac))}`,
  });
}

function fakeSms(ok = true) {
  const send = vi.fn<SmsProvider['send']>().mockResolvedValue({ ok });
  const sms: SmsProvider = { id: 'BRIQ', fixedCode: null, send };
  return { sms, send };
}

const nowSec = NOW.getTime() / 1000;

describe('handleSendSmsHook', () => {
  it('sends the sign-in code to the user phone when the signature is genuine', async () => {
    const { sms, send } = fakeSms();
    const res = await handleSendSmsHook(BODY, await sign(BODY, nowSec), {
      secret: SECRET,
      sms,
      now: () => NOW,
    });
    expect(res).toEqual({ status: 200, body: {} });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]?.[0];
    expect(msg?.to).toBe('+255763594105');
    expect(msg?.text).toContain('482913');
  });

  it('rejects a forged, tampered or stale call without sending', async () => {
    const { sms, send } = fakeSms();
    const deps = { secret: SECRET, sms, now: () => NOW };
    const tampered = BODY.replace('482913', '000000');
    expect((await handleSendSmsHook(tampered, await sign(BODY, nowSec), deps)).status).toBe(401);
    expect((await handleSendSmsHook(BODY, await sign(BODY, nowSec - 600), deps)).status).toBe(401);
    expect((await handleSendSmsHook(BODY, new Headers(), deps)).status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });

  it('fails closed when the secret or the provider is missing, or the send fails', async () => {
    const headers = await sign(BODY, nowSec);
    expect(
      (await handleSendSmsHook(BODY, headers, { secret: undefined, sms: fakeSms().sms, now: () => NOW }))
        .status,
    ).toBe(500);
    expect(
      (await handleSendSmsHook(BODY, headers, { secret: SECRET, sms: null, now: () => NOW })).status,
    ).toBe(503);
    expect(
      (await handleSendSmsHook(BODY, headers, { secret: SECRET, sms: fakeSms(false).sms, now: () => NOW }))
        .status,
    ).toBe(502);
  });
});
