import { describe, expect, it } from 'vitest';
import type { QuoteResult } from '@shared/pricing/types';
import { FIXTURE_SERVICES, SERVICE_IDS } from '@shared/pricing/fixtures';
import type { PortalService } from '../types';
import {
  clearDraft,
  defaultItem,
  draftReducer,
  loadDraft,
  newDraft,
  reachableStep,
  saveDraft,
  stepComplete,
  STEPS,
} from './state';

const service = (id: string): PortalService => {
  const s = FIXTURE_SERVICES.find((x) => x.id === id)!;
  return {
    ...s,
    category_id: null,
    description_sw: null,
    description_en: null,
    recurrence_days: null,
    sort: 0,
  };
};

const quote = (over: Partial<QuoteResult> = {}): QuoteResult => ({
  currency: 'TZS',
  lines: [],
  subtotal_tzs: 75000,
  travel_fee_tzs: 0,
  discount_tzs: 0,
  tax_tzs: 0,
  total_tzs: 75000,
  deposit_tzs: 22500,
  balance_tzs: 52500,
  requires_review: false,
  has_estimate: false,
  est_duration_min: 135,
  crew_size: 1,
  zone: null,
  out_of_area: false,
  tax: { mode: 'none', rate_pct: 18, label: 'VAT' },
  expires_at: '2026-10-20T09:00:00.000Z',
  ...over,
});

describe('defaultItem', () => {
  it('picks a sensible first choice per pricing model', () => {
    expect(defaultItem(service(SERVICE_IDS.sofa))).toMatchObject({ qty: 1, addons: [] });
    expect(defaultItem(service(SERVICE_IDS.carpet)).variant).toBe('5x6');
    expect(defaultItem(service(SERVICE_IDS.deepClean)).rooms).toEqual({ bedroom: 1 });
    expect(defaultItem(service(SERVICE_IDS.postConstruction)).area_range).toBe('under_50');
    expect(defaultItem(service(SERVICE_IDS.mould))).toMatchObject({ qty: 1 });
  });
});

describe('draftReducer', () => {
  const base = newDraft('usafi-bora');
  const item = defaultItem(service(SERVICE_IDS.sofa));

  it('mints one idempotency key per draft and keeps it across edits', () => {
    expect(base.idempotency_key).toMatch(/^booking_[0-9a-f-]{32,36}$/);
    const next = draftReducer(base, { type: 'add_item', item });
    expect(next.idempotency_key).toBe(base.idempotency_key);
    expect(draftReducer(next, { type: 'reset' }).idempotency_key).not.toBe(base.idempotency_key);
  });

  it('forgets the chosen slot whenever the price inputs change', () => {
    let d = draftReducer(base, { type: 'add_item', item });
    d = draftReducer(d, {
      type: 'set_slot',
      slot: { start: '2026-10-16T06:00:00Z', end: '2026-10-16T08:15:00Z' },
    });
    expect(d.slot).not.toBeNull();
    expect(draftReducer(d, { type: 'update_item', key: item.key, patch: { qty: 3 } }).slot).toBeNull();
    expect(draftReducer(d, { type: 'set_address', patch: { area: 'Mbezi' } }).slot).toBeNull();
    expect(draftReducer(d, { type: 'remove_item', key: item.key }).items).toEqual([]);
    expect(draftReducer(d, { type: 'set_notes', notes: 'dog' }).slot).not.toBeNull();
  });

  it('drops the verification when the phone changes', () => {
    let d = draftReducer(base, {
      type: 'set_contact',
      patch: { phoneRaw: '715880342', phoneE164: '+255715880342' },
    });
    d = draftReducer(d, {
      type: 'set_verify',
      verify: { phone: '+255715880342', token: 'tok', expires_at: '2099-01-01T00:00:00Z' },
    });
    expect(draftReducer(d, { type: 'set_contact', patch: { name: 'Daudi' } }).verify).not.toBeNull();
    expect(
      draftReducer(d, { type: 'set_contact', patch: { phoneRaw: '713', phoneE164: null } }).verify,
    ).toBeNull();
  });
});

describe('step gating', () => {
  const now = new Date('2026-10-14T09:00:00Z');
  const item = defaultItem(service(SERVICE_IDS.sofa));
  const withItems = draftReducer(newDraft('usafi-bora'), { type: 'add_item', item });

  it('walks the steps in order and never past an incomplete one', () => {
    expect(reachableStep({ draft: newDraft('usafi-bora'), quote: null, now })).toBe('services');
    expect(reachableStep({ draft: withItems, quote: quote(), now })).toBe('location');
    const located = draftReducer(withItems, { type: 'set_address', patch: { area: 'Mbezi Beach' } });
    expect(reachableStep({ draft: located, quote: quote(), now })).toBe('time');
    expect(reachableStep({ draft: located, quote: quote({ out_of_area: true }), now })).toBe('location');
    const timed = draftReducer(located, {
      type: 'set_slot',
      slot: { start: '2026-10-16T06:00:00Z', end: '2026-10-16T08:15:00Z' },
    });
    expect(reachableStep({ draft: timed, quote: quote(), now })).toBe('contact');
    let verified = draftReducer(timed, {
      type: 'set_contact',
      patch: { name: 'Daudi Lyimo', phoneRaw: '715880342', phoneE164: '+255715880342' },
    });
    verified = draftReducer(verified, {
      type: 'set_verify',
      verify: { phone: '+255715880342', token: 't', expires_at: '2026-10-14T09:15:00Z' },
    });
    expect(reachableStep({ draft: verified, quote: quote(), now })).toBe('review');
    expect(
      stepComplete('contact', { draft: verified, quote: quote(), now: new Date('2026-10-14T09:16:00Z') }),
    ).toBe(false);
  });

  it('a review-priced job can skip the slot', () => {
    const located = draftReducer(withItems, { type: 'set_address', patch: { area: 'Mbezi Beach' } });
    expect(stepComplete('time', { draft: located, quote: quote({ requires_review: true }), now })).toBe(true);
    expect(stepComplete('time', { draft: located, quote: quote(), now })).toBe(false);
    expect(STEPS).toHaveLength(5);
  });
});

describe('draft persistence', () => {
  it('survives a reload in the same tab, scoped to the company', () => {
    const d = draftReducer(newDraft('usafi-bora'), {
      type: 'add_item',
      item: defaultItem(service(SERVICE_IDS.sofa)),
    });
    saveDraft(d);
    expect(loadDraft('usafi-bora')?.idempotency_key).toBe(d.idempotency_key);
    expect(loadDraft('pwani-fresh')).toBeNull();
    clearDraft('usafi-bora');
    expect(loadDraft('usafi-bora')).toBeNull();
  });
});
