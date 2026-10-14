import { describe, expect, it } from 'vitest';
import { FIXTURE_SERVICES } from '@shared/pricing/fixtures';
import { PRICING_RULE_SCHEMAS } from '@shared/pricing/rules';
import {
  draftForType,
  draftToRule,
  emptyRuleDraft,
  emptyServiceForm,
  formToService,
  issueMessage,
  keyFromLabel,
  ruleToDraft,
  serviceFormSchema,
  serviceToForm,
} from './service-form-schema';
import type { AddonRow, ServiceRow } from './types';

describe('service form ↔ pricing rule', () => {
  it('round-trips every seeded rule through the draft without changing it', () => {
    for (const s of FIXTURE_SERVICES) {
      const draft = ruleToDraft(s.pricing_type, s.pricing_rule);
      const back = draftToRule(s.pricing_type, draft);
      const expected = PRICING_RULE_SCHEMAS[s.pricing_type].parse(s.pricing_rule);
      expect(PRICING_RULE_SCHEMAS[s.pricing_type].parse(back), s.name_en).toEqual(expected);
    }
  });

  it('a blank draft fails validation on the required fields only', () => {
    const values = {
      ...emptyServiceForm(),
      name_en: 'X',
      name_sw: 'X',
      pricing_type: 'PER_SEAT' as const,
      pricing_rule: emptyRuleDraft(),
    };
    const result = serviceFormSchema.safeParse(values);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => [i.path.join('.'), i.message])).toEqual([
        ['pricing_rule.price_tzs', 'validation.required'],
      ]);
    }
  });

  it('keeps typed money when switching between models', () => {
    const d = { ...emptyRuleDraft(), price_tzs: 15000, min_charge_tzs: 45000 };
    const next = draftForType('PER_VARIANT', d);
    expect(next.price_tzs).toBe(15000);
    expect(next.min_charge_tzs).toBe(45000);
    expect(next.variants).toHaveLength(1);
  });

  it('maps zod built-in messages to i18n keys', () => {
    expect(
      issueMessage({
        code: 'invalid_type',
        expected: 'number',
        received: 'undefined',
        path: [],
        message: 'Required',
      }),
    ).toBe('validation.required');
    expect(issueMessage({ code: 'custom', path: [], message: 'validation.rule.min_gt_max' })).toBe(
      'validation.rule.min_gt_max',
    );
    expect(issueMessage({ code: 'custom', path: [], message: 'anything else' })).toBe('validation.invalid');
    expect(
      issueMessage({ code: 'too_small', minimum: 1, type: 'array', inclusive: true, path: [], message: '' }),
    ).toBe('validation.rule.list_empty');
    expect(
      issueMessage({ code: 'too_big', maximum: 1, type: 'string', inclusive: true, path: [], message: '' }),
    ).toBe('validation.too_long');
  });

  it('derives option keys from labels', () => {
    expect(keyFromLabel('5×6 ft')).toBe('5x6_ft');
    expect(keyFromLabel('  Sitting room ')).toBe('sitting_room');
    expect(keyFromLabel('Über-Large!!')).toBe('ber_large');
  });

  it('converts a stored service to form values and back', () => {
    const row: ServiceRow = {
      id: 's1',
      category_id: 'c1',
      name_sw: 'Usafi wa sofa',
      name_en: 'Sofa cleaning',
      description_sw: null,
      description_en: 'Deep clean',
      pricing_type: 'PER_SEAT',
      pricing_rule: { price_tzs: 15000, min_charge_tzs: 45000 },
      duration_rule: { base_min: 30, per_unit_min: 20 },
      crew_size: 1,
      recurrence_days: 90,
      sort: 3,
      active: true,
      deleted_at: null,
      updated_at: '2026-10-14T00:00:00Z',
    };
    const addons: AddonRow[] = [
      {
        id: 'a1',
        service_id: 's1',
        name_sw: 'Madoa',
        name_en: 'Stains',
        price_tzs: 5000,
        per_unit: true,
        sort: 0,
        active: true,
      },
      {
        id: 'a2',
        service_id: 'other',
        name_sw: 'X',
        name_en: 'X',
        price_tzs: 1,
        per_unit: false,
        sort: 0,
        active: true,
      },
    ];
    const form = serviceToForm(row, addons);
    expect(form.addons).toHaveLength(1);
    expect(form.duration).toEqual({ base_min: 30, per_unit_min: 20, per_sqm_min: 0, per_room_min: 0 });
    const input = formToService(form, { id: row.id, sort: row.sort });
    expect(input).toMatchObject({
      id: 's1',
      category_id: 'c1',
      description_sw: null,
      pricing_type: 'PER_SEAT',
      pricing_rule: { price_tzs: 15000, min_charge_tzs: 45000 },
      sort: 3,
    });
    expect(formToService({ ...form, category_id: '' }, null)).not.toHaveProperty('id');
  });
});
