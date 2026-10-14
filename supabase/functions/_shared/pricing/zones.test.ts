import { describe, expect, it } from 'vitest';
import { FIXTURE_BASE, FIXTURE_ZONES, ZONE_IDS } from './fixtures.ts';
import type { CatalogZone, GeoJsonPolygon } from './types.ts';
import { haversineKm, pointInPolygon, resolveZone } from './zones.ts';

const square: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [39.0, -7.0],
      [40.0, -7.0],
      [40.0, -6.0],
      [39.0, -6.0],
      [39.0, -7.0],
    ],
  ],
};

describe('haversineKm', () => {
  it('measures Mbezi Beach → Masaki at roughly 9 km', () => {
    const d = haversineKm(FIXTURE_BASE, { lat: -6.755, lng: 39.275 });
    expect(d).toBeGreaterThan(7);
    expect(d).toBeLessThan(10);
    expect(haversineKm(FIXTURE_BASE, FIXTURE_BASE)).toBe(0);
  });
});

describe('pointInPolygon', () => {
  it('detects inside and outside', () => {
    expect(pointInPolygon({ lat: -6.5, lng: 39.5 }, square)).toBe(true);
    expect(pointInPolygon({ lat: -5.5, lng: 39.5 }, square)).toBe(false);
    expect(pointInPolygon({ lat: -6.5, lng: 41 }, square)).toBe(false);
  });

  it('excludes holes', () => {
    const withHole: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        square.coordinates[0]!,
        [
          [39.4, -6.6],
          [39.6, -6.6],
          [39.6, -6.4],
          [39.4, -6.4],
          [39.4, -6.6],
        ],
      ],
    };
    expect(pointInPolygon({ lat: -6.5, lng: 39.5 }, withHole)).toBe(false);
    expect(pointInPolygon({ lat: -6.9, lng: 39.1 }, withHole)).toBe(true);
  });

  it('treats degenerate rings as outside', () => {
    expect(pointInPolygon({ lat: -6.5, lng: 39.5 }, { type: 'Polygon', coordinates: [] })).toBe(false);
    expect(pointInPolygon({ lat: -6.5, lng: 39.5 }, { type: 'Polygon', coordinates: [[[39, -7], [40, -7]]] })).toBe(false);
    const tinyHole: GeoJsonPolygon = { type: 'Polygon', coordinates: [square.coordinates[0]!, [[39.5, -6.5]]] };
    expect(pointInPolygon({ lat: -6.5, lng: 39.5 }, tinyHole)).toBe(true);
  });
});

describe('resolveZone', () => {
  it('returns null without an address', () => {
    expect(resolveZone(null, FIXTURE_ZONES, FIXTURE_BASE)).toBeNull();
    expect(resolveZone(undefined, FIXTURE_ZONES, FIXTURE_BASE)).toBeNull();
  });

  it('polygon beats area name and distance', () => {
    const r = resolveZone({ lat: -6.77, lng: 39.28, area: 'Kigamboni' }, FIXTURE_ZONES, FIXTURE_BASE);
    expect(r).toMatchObject({ zone_id: ZONE_IDS.kinondoni, matched_by: 'polygon' });
    expect(r?.distance_km).toBeGreaterThan(0);
    const noBase = resolveZone({ lat: -6.77, lng: 39.28 }, FIXTURE_ZONES, null);
    expect(noBase).toMatchObject({ zone_id: ZONE_IDS.kinondoni, matched_by: 'polygon', distance_km: null });
  });

  it('matches area names loosely and case-insensitively', () => {
    expect(resolveZone({ area: 'mbezi beach' }, FIXTURE_ZONES, FIXTURE_BASE)?.zone_id).toBe(ZONE_IDS.mbezi);
    expect(resolveZone({ area: 'Near Temeke hospital' }, FIXTURE_ZONES, FIXTURE_BASE)?.zone_id).toBe(ZONE_IDS.kigamboni);
    expect(resolveZone({ area: 'Kigam' }, FIXTURE_ZONES, FIXTURE_BASE)?.zone_id).toBe(ZONE_IDS.kigamboni);
    expect(resolveZone({ area: '' }, FIXTURE_ZONES, FIXTURE_BASE)).toBeNull();
    const blankArea: CatalogZone = { ...FIXTURE_ZONES[0]!, areas: [' '] };
    expect(resolveZone({ area: 'Mbezi' }, [blankArea], null)).toBeNull();
    const withPin = resolveZone({ area: 'Goba', lat: -6.72, lng: 39.2 }, FIXTURE_ZONES, FIXTURE_BASE);
    expect(withPin).toMatchObject({ matched_by: 'area', zone_id: ZONE_IDS.mbezi });
    expect(withPin?.distance_km).not.toBeNull();
  });

  it('falls back to the tightest distance band from the tenant base', () => {
    const near = resolveZone({ lat: -6.73, lng: 39.22 }, FIXTURE_ZONES, FIXTURE_BASE);
    expect(near).toMatchObject({ zone_id: ZONE_IDS.mbezi, matched_by: 'distance' });
    const far = resolveZone({ lat: -6.95, lng: 39.3 }, FIXTURE_ZONES, FIXTURE_BASE);
    expect(far).toMatchObject({ zone_id: ZONE_IDS.kigamboni, matched_by: 'distance' });
    const callbackOnly = resolveZone({ lat: -6.44, lng: 38.9 }, FIXTURE_ZONES, FIXTURE_BASE);
    expect(callbackOnly).toMatchObject({ zone_id: ZONE_IDS.bagamoyo, serviceable: false });
    expect(resolveZone({ lat: -8.9, lng: 33.4 }, FIXTURE_ZONES, FIXTURE_BASE)).toBeNull();
  });

  it('ignores distance bands without a tenant base and inactive zones', () => {
    expect(resolveZone({ lat: -6.73, lng: 39.22 }, FIXTURE_ZONES, null)).toBeNull();
    const inactive = FIXTURE_ZONES.map((z) => ({ ...z, active: false }));
    expect(resolveZone({ area: 'Mbezi' }, inactive, FIXTURE_BASE)).toBeNull();
  });
});
