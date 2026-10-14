import { describe, expect, it } from 'vitest';
import { FIXTURE_SERVICES, SERVICE_IDS } from '@shared/pricing/fixtures';
import { startingPrice } from './pricing-labels';

const byId = (id: string) => FIXTURE_SERVICES.find((s) => s.id === id)!;

describe('startingPrice', () => {
  it('summarises each pricing model for list rows', () => {
    const sofa = byId(SERVICE_IDS.sofa);
    expect(startingPrice(sofa.pricing_type, sofa.pricing_rule)).toEqual({
      amount_tzs: 15000,
      per: { sw: 'kiti', en: 'seat' },
      from: false,
    });
    const carpet = byId(SERVICE_IDS.carpet);
    expect(startingPrice(carpet.pricing_type, carpet.pricing_rule)).toMatchObject({
      amount_tzs: 35000,
      from: true,
    });
    const deep = byId(SERVICE_IDS.deepClean);
    expect(startingPrice(deep.pricing_type, deep.pricing_rule)).toMatchObject({
      amount_tzs: 20000,
      per: { en: 'room' },
    });
    const office = byId(SERVICE_IDS.office);
    expect(startingPrice(office.pricing_type, office.pricing_rule)).toMatchObject({
      amount_tzs: 1200,
      per: { en: 'm²' },
    });
    const flat = byId(SERVICE_IDS.fumigation);
    expect(startingPrice(flat.pricing_type, flat.pricing_rule)).toEqual({
      amount_tzs: 120000,
      per: null,
      from: false,
    });
    const tank = byId(SERVICE_IDS.waterTank);
    expect(startingPrice(tank.pricing_type, tank.pricing_rule)).toMatchObject({
      amount_tzs: 60000,
      per: { en: 'tank' },
    });
    const mould = byId(SERVICE_IDS.mould);
    expect(startingPrice(mould.pricing_type, mould.pricing_rule)).toEqual({
      amount_tzs: 50000,
      per: null,
      from: true,
    });
    const commercial = byId(SERVICE_IDS.commercial);
    expect(startingPrice(commercial.pricing_type, commercial.pricing_rule)).toBeNull();
  });

  it('returns null for malformed rules instead of a wrong number', () => {
    expect(startingPrice('FLAT', { price_tzs: -1 })).toBeNull();
    expect(startingPrice('PER_VARIANT', { variants: [] })).toBeNull();
  });
});
