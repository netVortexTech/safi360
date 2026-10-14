// Zone resolution without PostGIS: polygon containment, area-name match, distance band.
import type { CatalogZone, GeoJsonPolygon, LatLng, ZoneResolution } from './types.ts';
import type { QuoteAddressInput } from './rules.ts';

const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/** Ray casting on one ring of [lng, lat] pairs. Points on an edge count as inside. */
function inRing(point: LatLng, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    const crosses = yi > point.lat !== yj > point.lat;
    if (!crosses) continue;
    const xAtLat = ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (point.lng < xAtLat) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: LatLng, polygon: GeoJsonPolygon): boolean {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer || outer.length < 3) return false;
  if (!inRing(point, outer)) return false;
  return !holes.some((hole) => hole.length >= 3 && inRing(point, hole));
}

function normaliseArea(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function areaMatches(typed: string, zoneArea: string): boolean {
  const a = normaliseArea(typed); // never empty: resolveZone only calls this for a non-empty area
  const b = normaliseArea(zoneArea);
  if (!b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Resolution order: polygon → area name → distance band from the tenant base.
 * Returns null when nothing matches (the booking page then offers a callback).
 */
export function resolveZone(
  address: QuoteAddressInput | null | undefined,
  zones: CatalogZone[],
  base: LatLng | null,
): ZoneResolution | null {
  if (!address) return null;
  const active = zones.filter((z) => z.active);
  const pin: LatLng | null = address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null;

  if (pin) {
    const byPolygon = active.find((z) => z.polygon && pointInPolygon(pin, z.polygon));
    if (byPolygon) return toResolution(byPolygon, 'polygon', base && pin ? haversineKm(base, pin) : null);
  }

  if (address.area) {
    const typed = address.area;
    const byArea = active.find((z) => z.areas.some((a) => areaMatches(typed, a)));
    if (byArea) return toResolution(byArea, 'area', base && pin ? haversineKm(base, pin) : null);
  }

  if (pin && base) {
    const distance = haversineKm(base, pin);
    const band = active
      .filter((z): z is CatalogZone & { max_km: number } => z.max_km != null && z.max_km >= distance)
      .sort((a, b) => a.max_km - b.max_km)[0];
    if (band) return toResolution(band, 'distance', distance);
  }

  return null;
}

function toResolution(
  zone: CatalogZone,
  matchedBy: ZoneResolution['matched_by'],
  distanceKm: number | null,
): ZoneResolution {
  return {
    zone_id: zone.id,
    name: zone.name,
    travel_fee_tzs: zone.travel_fee_tzs,
    serviceable: zone.serviceable,
    matched_by: matchedBy,
    distance_km: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
  };
}
