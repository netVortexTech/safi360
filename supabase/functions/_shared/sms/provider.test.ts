import { describe, expect, it, vi } from 'vitest';
import { BRIQ_SEND_URL, BriqSmsProvider, MockSmsProvider, smsProviderFromEnv } from './provider.ts';

const okResponse = () =>
  new Response(JSON.stringify({ success: true, job_id: 'instant--abc', status: 'sent' }), { status: 200 });

describe('BriqSmsProvider', () => {
  it('posts the message to Briq with the key, digits-only recipient and sender ID', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const sms = new BriqSmsProvider('key-1', 'SAFI360', fetchFn);
    const res = await sms.send({ to: '+255763594105', text: 'hello', locale: 'sw' });

    expect(res).toEqual({ ok: true, provider_ref: 'instant--abc' });
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(BRIQ_SEND_URL);
    expect((init?.headers as Record<string, string>)['X-API-Key']).toBe('key-1');
    expect(JSON.parse(init?.body as string)).toEqual({
      content: 'hello',
      recipients: ['255763594105'],
      sender_id: 'SAFI360',
    });
    expect(sms.fixedCode).toBeNull();
  });

  it('reports failure on a Briq refusal or a network error', async () => {
    const refused = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ code: 'INVALID_SENDER_ID' }] }), {
        status: 422,
      }),
    );
    expect(
      await new BriqSmsProvider('k', 'X', refused).send({ to: '+255763594105', text: 't', locale: 'sw' }),
    ).toEqual({ ok: false });

    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    expect(
      await new BriqSmsProvider('k', 'X', down).send({ to: '+255763594105', text: 't', locale: 'sw' }),
    ).toEqual({ ok: false });
  });
});

describe('smsProviderFromEnv', () => {
  it('picks Briq only when both the key and the sender ID are set', () => {
    expect(smsProviderFromEnv({ OTP_PROVIDER: 'briq', BRIQ_API_KEY: 'k', BRIQ_SENDER_ID: 'S' })?.id).toBe(
      'BRIQ',
    );
    expect(smsProviderFromEnv({ OTP_PROVIDER: 'briq', BRIQ_API_KEY: 'k' })).toBeNull();
    expect(smsProviderFromEnv({ OTP_PROVIDER: 'briq', BRIQ_SENDER_ID: 'S' })).toBeNull();
  });

  it('never uses the mock in production', () => {
    expect(smsProviderFromEnv({ OTP_PROVIDER: 'mock', APP_ENV: 'staging' })).toBeInstanceOf(MockSmsProvider);
    expect(smsProviderFromEnv({ OTP_PROVIDER: 'mock', APP_ENV: 'production' })).toBeNull();
  });
});
