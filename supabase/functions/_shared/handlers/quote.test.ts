import { describe, expect, it } from 'vitest';
import { ADDON_IDS, SERVICE_IDS } from '../pricing/fixtures.ts';
import type { ApiError } from '../schemas.ts';
import { fakeDeps, fakeWorld } from './fake-deps.ts';
import { handleQuote, type QuoteResponse } from './quote.ts';

const sofa5 = { service_id: SERVICE_IDS.sofa, qty: 5 };

describe('handleQuote', () => {
  it('prices a valid request from the live catalog', async () => {
    const world = fakeWorld();
    const res = await handleQuote(
      { slug: 'usafi-bora', items: [sofa5], address: { area: 'Mikocheni' } },
      fakeDeps(world),
    );
    expect(res.status).toBe(200);
    const body = res.body as QuoteResponse;
    expect(body.tenant).toEqual({ slug: 'usafi-bora', name: 'Usafi Bora Cleaners' });
    expect(body.quote.total_tzs).toBe(80000);
    expect(body.quote.deposit_tzs).toBe(24000);
    expect(body.quote.expires_at).toBe('2026-10-20T09:00:00.000Z');
    expect(world.rateLimitCalls).toEqual([`${world.tenants[0]?.id}:quote`]);
  });

  it('editing a service changes the very next quote (no caching)', async () => {
    const world = fakeWorld();
    const deps = fakeDeps(world);
    const before = (await handleQuote({ slug: 'usafi-bora', items: [sofa5] }, deps)).body as QuoteResponse;
    expect(before.quote.total_tzs).toBe(75000);

    const sofa = world.catalog.services.find((s) => s.id === SERVICE_IDS.sofa)!;
    sofa.pricing_rule = { price_tzs: 18000, min_charge_tzs: 45000 };
    const after = (await handleQuote({ slug: 'usafi-bora', items: [sofa5] }, deps)).body as QuoteResponse;
    expect(after.quote.total_tzs).toBe(90000);

    sofa.active = false;
    const gone = await handleQuote({ slug: 'usafi-bora', items: [sofa5] }, deps);
    expect(gone.status).toBe(422);
    expect((gone.body as ApiError).code).toBe('service_inactive');
  });

  it('rejects malformed bodies with field errors and never touches the tenant', async () => {
    const world = fakeWorld();
    const res = await handleQuote({ slug: 'usafi-bora', items: [] }, fakeDeps(world));
    expect(res.status).toBe(422);
    expect((res.body as ApiError).field_errors).toEqual({ items: 'validation.items.empty' });
    expect(world.rateLimitCalls).toEqual([]);

    const garbage = await handleQuote(null, fakeDeps(world));
    expect(garbage.status).toBe(422);
    const extra = await handleQuote({ slug: 'usafi-bora', items: [sofa5], tenant_id: 'x' }, fakeDeps(world));
    expect(extra.status).toBe(422);
  });

  it('maps quote problems to 422 with the offending path', async () => {
    const res = await handleQuote(
      {
        slug: 'usafi-bora',
        items: [{ service_id: SERVICE_IDS.carpet, qty: 1, addons: [{ addon_id: ADDON_IDS.stain }] }],
      },
      fakeDeps(fakeWorld()),
    );
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      code: 'variant_required',
      field_errors: { 'items.0.variant': 'quote.error.variant_required' },
    });
  });

  it('unknown and suspended tenants, and rate limits', async () => {
    expect((await handleQuote({ slug: 'nobody', items: [sofa5] }, fakeDeps(fakeWorld()))).status).toBe(404);
    expect((await handleQuote({ slug: 'pwani-fresh', items: [sofa5] }, fakeDeps(fakeWorld()))).status).toBe(
      403,
    );
    const limited = await handleQuote(
      { slug: 'usafi-bora', items: [sofa5] },
      fakeDeps(fakeWorld({ rateLimited: true })),
    );
    expect(limited.status).toBe(429);
    expect((limited.body as ApiError).retryable).toBe(true);
  });

  it('fails closed when tenant settings are corrupt', async () => {
    const world = fakeWorld();
    world.tenants[0]!.settings = { deposit_pct: 'thirty' };
    const res = await handleQuote({ slug: 'usafi-bora', items: [sofa5] }, fakeDeps(world));
    expect(res.status).toBe(500);
    expect((res.body as ApiError).code).toBe('tenant_settings_invalid');
  });

  it('tolerates a tenant without a base location (distance bands off)', async () => {
    const world = fakeWorld();
    world.tenants[0]!.base_lat = null;
    world.tenants[0]!.base_lng = null;
    const res = await handleQuote(
      { slug: 'usafi-bora', items: [sofa5], address: { lat: -6.73, lng: 39.22 } },
      fakeDeps(world),
    );
    expect(res.status).toBe(200);
    expect((res.body as QuoteResponse).quote.out_of_area).toBe(true);
  });
});
