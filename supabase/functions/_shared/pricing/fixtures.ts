// The Usafi Bora Cleaners catalog, exactly as seeded in supabase/seed.sql.
// The db test suite asserts the seeded rows equal these objects, so pricing tests run
// against the same price list the local app shows. Ids are fixed so tests can name them.
import type { CatalogAddon, CatalogService, CatalogZone, LatLng } from './types.ts';

export const FIXTURE_TENANT_ID = '11111111-1111-4111-8111-111111111111';
export const FIXTURE_BASE: LatLng = { lat: -6.7199, lng: 39.2113 }; // Mbezi Beach

export const CATEGORY_IDS = {
  sofa: '44440000-0000-4000-8000-000000000001',
  carpets: '44440000-0000-4000-8000-000000000002',
  home: '44440000-0000-4000-8000-000000000003',
  office: '44440000-0000-4000-8000-000000000004',
  fumigation: '44440000-0000-4000-8000-000000000005',
} as const;

export const SERVICE_IDS = {
  sofa: '55550000-0000-4000-8000-000000000001',
  carpet: '55550000-0000-4000-8000-000000000002',
  mattress: '55550000-0000-4000-8000-000000000003',
  deepClean: '55550000-0000-4000-8000-000000000004',
  postConstruction: '55550000-0000-4000-8000-000000000005',
  office: '55550000-0000-4000-8000-000000000006',
  fumigation: '55550000-0000-4000-8000-000000000007',
  waterTank: '55550000-0000-4000-8000-000000000008',
  mould: '55550000-0000-4000-8000-000000000009',
  commercial: '55550000-0000-4000-8000-000000000010',
  curtainsInactive: '55550000-0000-4000-8000-000000000011',
} as const;

export const ADDON_IDS = {
  stain: '66660000-0000-4000-8000-000000000001',
  odour: '66660000-0000-4000-8000-000000000002',
  petHair: '66660000-0000-4000-8000-000000000003',
  protection: '66660000-0000-4000-8000-000000000004',
  retiredInactive: '66660000-0000-4000-8000-000000000005',
} as const;

export const ZONE_IDS = {
  mbezi: '77770000-0000-4000-8000-000000000001',
  kinondoni: '77770000-0000-4000-8000-000000000002',
  kigamboni: '77770000-0000-4000-8000-000000000003',
  bagamoyo: '77770000-0000-4000-8000-000000000004',
} as const;

export const STAFF_IDS = {
  neema: '88880000-0000-4000-8000-000000000001',
  rehema: '88880000-0000-4000-8000-000000000002',
  juma: '88880000-0000-4000-8000-000000000003',
  baraka: '88880000-0000-4000-8000-000000000004',
  aminaInactive: '88880000-0000-4000-8000-000000000005',
} as const;

export const FIXTURE_SERVICES: CatalogService[] = [
  {
    id: SERVICE_IDS.sofa,
    name_sw: 'Usafi wa sofa',
    name_en: 'Sofa cleaning',
    pricing_type: 'PER_SEAT',
    pricing_rule: { price_tzs: 15000, min_charge_tzs: 45000, min_seats: 1 },
    duration_rule: { base_min: 30, per_unit_min: 20 },
    crew_size: 1,
    active: true,
  },
  {
    id: SERVICE_IDS.carpet,
    name_sw: 'Usafi wa zulia',
    name_en: 'Carpet cleaning',
    pricing_type: 'PER_VARIANT',
    pricing_rule: {
      variants: [
        { key: '5x6', label_sw: 'Futi 5×6', label_en: '5×6 ft', price_tzs: 35000 },
        { key: '6x6', label_sw: 'Futi 6×6', label_en: '6×6 ft', price_tzs: 40000 },
        { key: '8x10', label_sw: 'Futi 8×10', label_en: '8×10 ft', price_tzs: 60000 },
      ],
    },
    duration_rule: { base_min: 30, per_unit_min: 30 },
    crew_size: 1,
    active: true,
  },
  {
    id: SERVICE_IDS.mattress,
    name_sw: 'Usafi wa godoro',
    name_en: 'Mattress cleaning',
    pricing_type: 'PER_VARIANT',
    pricing_rule: {
      variants: [
        {
          key: 'single',
          label_sw: 'Godoro la mtu mmoja (3.5×6)',
          label_en: 'Single (3.5×6)',
          price_tzs: 30000,
        },
        {
          key: 'double',
          label_sw: 'Godoro la watu wawili (5×6)',
          label_en: 'Double (5×6)',
          price_tzs: 40000,
        },
        { key: 'king', label_sw: 'King (6×6)', label_en: 'King (6×6)', price_tzs: 50000 },
      ],
      min_charge_tzs: 40000,
    },
    duration_rule: { base_min: 20, per_unit_min: 30 },
    crew_size: 1,
    active: true,
  },
  {
    id: SERVICE_IDS.deepClean,
    name_sw: 'Usafi wa kina wa nyumba',
    name_en: 'Residential deep clean',
    pricing_type: 'PER_ROOM',
    pricing_rule: {
      rooms: [
        { key: 'bedroom', label_sw: 'Chumba cha kulala', label_en: 'Bedroom', price_tzs: 30000 },
        { key: 'bathroom', label_sw: 'Bafu', label_en: 'Bathroom', price_tzs: 20000 },
        { key: 'kitchen', label_sw: 'Jiko', label_en: 'Kitchen', price_tzs: 35000 },
        { key: 'sitting', label_sw: 'Sebule', label_en: 'Sitting room', price_tzs: 30000 },
        { key: 'dining', label_sw: 'Chumba cha kulia', label_en: 'Dining room', price_tzs: 20000 },
      ],
      min_charge_tzs: 80000,
    },
    duration_rule: { base_min: 60, per_room_min: 45 },
    crew_size: 2,
    active: true,
  },
  {
    id: SERVICE_IDS.postConstruction,
    name_sw: 'Usafi baada ya ujenzi',
    name_en: 'Post-construction clean',
    pricing_type: 'PER_AREA',
    pricing_rule: {
      unit: 'sqm',
      tiers: [
        { up_to_sqm: 100, price_tzs: 2500 },
        { up_to_sqm: 300, price_tzs: 2200 },
        { up_to_sqm: null, price_tzs: 2000 },
      ],
      tier_mode: 'bracket',
      ranges: [
        {
          key: 'under_50',
          label_sw: 'Chini ya 50 m²',
          label_en: 'Under 50 m²',
          min_sqm: 0,
          max_sqm: 50,
          assumed_sqm: 40,
        },
        {
          key: '50_100',
          label_sw: '50–100 m²',
          label_en: '50–100 m²',
          min_sqm: 50,
          max_sqm: 100,
          assumed_sqm: 75,
        },
        {
          key: '100_200',
          label_sw: '100–200 m²',
          label_en: '100–200 m²',
          min_sqm: 100,
          max_sqm: 200,
          assumed_sqm: 150,
        },
        {
          key: '200_400',
          label_sw: '200–400 m²',
          label_en: '200–400 m²',
          min_sqm: 200,
          max_sqm: 400,
          assumed_sqm: 300,
        },
        {
          key: 'over_400',
          label_sw: 'Zaidi ya 400 m²',
          label_en: 'Over 400 m²',
          min_sqm: 400,
          max_sqm: null,
          assumed_sqm: 500,
        },
      ],
      min_charge_tzs: 150000,
    },
    duration_rule: { base_min: 120, per_sqm_min: 1.5 },
    crew_size: 3,
    active: true,
  },
  {
    id: SERVICE_IDS.office,
    name_sw: 'Usafi wa ofisi',
    name_en: 'Office cleaning',
    pricing_type: 'PER_AREA',
    pricing_rule: {
      unit: 'sqm',
      tiers: [
        { up_to_sqm: 200, price_tzs: 1500 },
        { up_to_sqm: null, price_tzs: 1200 },
      ],
      tier_mode: 'marginal',
      ranges: [
        {
          key: 'under_100',
          label_sw: 'Chini ya 100 m²',
          label_en: 'Under 100 m²',
          min_sqm: 0,
          max_sqm: 100,
          assumed_sqm: 80,
        },
        {
          key: '100_300',
          label_sw: '100–300 m²',
          label_en: '100–300 m²',
          min_sqm: 100,
          max_sqm: 300,
          assumed_sqm: 200,
        },
        {
          key: 'over_300',
          label_sw: 'Zaidi ya 300 m²',
          label_en: 'Over 300 m²',
          min_sqm: 300,
          max_sqm: null,
          assumed_sqm: 400,
        },
      ],
      min_charge_tzs: 100000,
    },
    duration_rule: { base_min: 60, per_sqm_min: 0.8 },
    crew_size: 2,
    active: true,
  },
  {
    id: SERVICE_IDS.fumigation,
    name_sw: 'Kufukiza nyumba ya vyumba 3',
    name_en: 'Fumigation, 3-bedroom house',
    pricing_type: 'FLAT',
    pricing_rule: { price_tzs: 120000 },
    duration_rule: { base_min: 90 },
    crew_size: 1,
    active: true,
  },
  {
    id: SERVICE_IDS.waterTank,
    name_sw: 'Usafi wa tanki la maji',
    name_en: 'Water tank cleaning',
    pricing_type: 'PER_UNIT',
    pricing_rule: { unit_sw: 'tanki', unit_en: 'tank', price_tzs: 60000, max_qty: 10 },
    duration_rule: { base_min: 60, per_unit_min: 90 },
    crew_size: 2,
    active: true,
  },
  {
    id: SERVICE_IDS.mould,
    name_sw: 'Matibabu ya ukungu na harufu',
    name_en: 'Mould & odour treatment',
    pricing_type: 'INSPECTION_REQUIRED',
    pricing_rule: { from_price_tzs: 50000 },
    duration_rule: { base_min: 120 },
    crew_size: 1,
    active: true,
  },
  {
    id: SERVICE_IDS.commercial,
    name_sw: 'Mkataba mkubwa wa kibiashara',
    name_en: 'Large commercial contract',
    pricing_type: 'CUSTOM_QUOTE',
    pricing_rule: {},
    duration_rule: { base_min: 480 },
    crew_size: 4,
    active: true,
  },
  {
    id: SERVICE_IDS.curtainsInactive,
    name_sw: 'Usafi wa mapazia',
    name_en: 'Curtain cleaning',
    pricing_type: 'PER_UNIT',
    pricing_rule: { unit_sw: 'pazia', unit_en: 'curtain', price_tzs: 8000, min_charge_tzs: 24000 },
    duration_rule: { base_min: 30, per_unit_min: 10 },
    crew_size: 1,
    active: false,
  },
];

export const FIXTURE_ADDONS: CatalogAddon[] = [
  {
    id: ADDON_IDS.stain,
    service_id: SERVICE_IDS.sofa,
    name_sw: 'Kuondoa madoa',
    name_en: 'Stain treatment',
    price_tzs: 5000,
    per_unit: true,
    active: true,
  },
  {
    id: ADDON_IDS.odour,
    service_id: null,
    name_sw: 'Kuondoa harufu',
    name_en: 'Odour removal',
    price_tzs: 15000,
    per_unit: false,
    active: true,
  },
  {
    id: ADDON_IDS.petHair,
    service_id: SERVICE_IDS.sofa,
    name_sw: 'Kuondoa manyoya ya wanyama',
    name_en: 'Pet hair removal',
    price_tzs: 10000,
    per_unit: false,
    active: true,
  },
  {
    id: ADDON_IDS.protection,
    service_id: SERVICE_IDS.carpet,
    name_sw: 'Kinga ya madoa',
    name_en: 'Stain protection',
    price_tzs: 8000,
    per_unit: true,
    active: true,
  },
  {
    id: ADDON_IDS.retiredInactive,
    service_id: SERVICE_IDS.sofa,
    name_sw: 'Manukato',
    name_en: 'Fragrance',
    price_tzs: 3000,
    per_unit: false,
    active: false,
  },
];

export const FIXTURE_ZONES: CatalogZone[] = [
  {
    id: ZONE_IDS.mbezi,
    name: 'Mbezi & Kimara',
    areas: ['Mbezi', 'Mbezi Beach', 'Kimara', 'Goba', 'Kibamba'],
    polygon: null,
    max_km: 10,
    travel_fee_tzs: 0,
    serviceable: true,
    active: true,
  },
  {
    id: ZONE_IDS.kinondoni,
    name: 'Kinondoni & Mikocheni',
    areas: [
      'Kinondoni',
      'Mikocheni',
      'Masaki',
      'Oysterbay',
      'Sinza',
      'Mwananyamala',
      'Msasani',
      'Kijitonyama',
    ],
    polygon: {
      type: 'Polygon',
      coordinates: [
        [
          [39.24, -6.81],
          [39.31, -6.81],
          [39.31, -6.73],
          [39.24, -6.73],
          [39.24, -6.81],
        ],
      ],
    },
    max_km: 20,
    travel_fee_tzs: 5000,
    serviceable: true,
    active: true,
  },
  {
    id: ZONE_IDS.kigamboni,
    name: 'Kigamboni & Mbagala',
    areas: ['Kigamboni', 'Mbagala', 'Temeke'],
    polygon: null,
    max_km: 35,
    travel_fee_tzs: 15000,
    serviceable: true,
    active: true,
  },
  {
    id: ZONE_IDS.bagamoyo,
    name: 'Bagamoyo (callback only)',
    areas: ['Bagamoyo'],
    polygon: null,
    max_km: 70,
    travel_fee_tzs: 0,
    serviceable: false,
    active: true,
  },
];

export const FIXTURE_CATALOG = {
  services: FIXTURE_SERVICES,
  addons: FIXTURE_ADDONS,
  zones: FIXTURE_ZONES,
};
