// The pricing engine is unit-tested against _shared/pricing/fixtures.ts. This suite proves
// the seeded catalog is that same price list, so "tests pass" means "the local app prices
// jobs the way the tests say".
import {
  FIXTURE_ADDONS,
  FIXTURE_BASE,
  FIXTURE_SERVICES,
  FIXTURE_TENANT_ID,
  FIXTURE_ZONES,
  STAFF_IDS,
} from '../functions/_shared/pricing/fixtures.ts';
import { TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

describe('seed ↔ fixtures parity', () => {
  it('services match name, type, rule, duration, crew and active flag', async () => {
    const rows = await db.sql<{
      id: string;
      name_sw: string;
      name_en: string;
      pricing_type: string;
      pricing_rule: unknown;
      duration_rule: unknown;
      crew_size: number;
      active: boolean;
    }>(
      `select id, name_sw, name_en, pricing_type::text, pricing_rule, duration_rule, crew_size, active
       from public.services where tenant_id = $1 order by sort`,
      [FIXTURE_TENANT_ID],
    );
    expect(rows.map((r) => r.id)).toEqual(FIXTURE_SERVICES.map((s) => s.id));
    for (const fixture of FIXTURE_SERVICES) {
      const row = rows.find((r) => r.id === fixture.id);
      expect(row, fixture.name_en).toMatchObject({
        name_sw: fixture.name_sw,
        name_en: fixture.name_en,
        pricing_type: fixture.pricing_type,
        crew_size: fixture.crew_size,
        active: fixture.active,
      });
      expect(row?.pricing_rule, `${fixture.name_en} pricing_rule`).toEqual(fixture.pricing_rule);
      expect(row?.duration_rule, `${fixture.name_en} duration_rule`).toEqual(fixture.duration_rule);
    }
  });

  it('add-ons match', async () => {
    const rows = await db.sql<Record<string, unknown>>(
      `select id, service_id, name_sw, name_en, price_tzs, per_unit, active from public.service_addons where tenant_id = $1 order by sort`,
      [FIXTURE_TENANT_ID],
    );
    expect(rows).toEqual(FIXTURE_ADDONS);
  });

  it('zones match, including the GeoJSON polygon and distance bands', async () => {
    const rows = await db.sql<Record<string, unknown>>(
      `select id, name, areas, polygon, max_km::float as max_km, travel_fee_tzs, serviceable, active
       from public.service_zones where tenant_id = $1 order by sort`,
      [FIXTURE_TENANT_ID],
    );
    expect(rows).toEqual(FIXTURE_ZONES);
  });

  it('the tenant base matches', async () => {
    const [row] = await db.sql<{ base_lat: number; base_lng: number }>(
      `select base_lat, base_lng from public.tenants where id = $1`,
      [FIXTURE_TENANT_ID],
    );
    expect(row).toEqual({ base_lat: FIXTURE_BASE.lat, base_lng: FIXTURE_BASE.lng });
  });

  it('staff skills only reference services of the same tenant', async () => {
    const rows = await db.sql<{ id: string; bad: number }>(
      `select s.id, count(*) filter (where sv.id is null or sv.tenant_id <> s.tenant_id)::int as bad
       from public.staff s
       left join lateral unnest(s.skills) as sk(service_id) on true
       left join public.services sv on sv.id = sk.service_id
       group by s.id`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const r of rows) expect(r.bad, r.id).toBe(0);
    const ids = rows.map((r) => r.id);
    for (const id of Object.values(STAFF_IDS)) expect(ids).toContain(id);
  });
});
