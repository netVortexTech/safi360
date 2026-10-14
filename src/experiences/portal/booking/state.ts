// The booking draft: one reducer, persisted per tab so a refresh does not lose the form.
// The idempotency key is minted when the draft starts, so every submit of this draft
// (double tap, retry after a timeout) returns the same ticket.
import { useEffect, useReducer, useRef } from 'react';
import { PRICING_RULE_SCHEMAS } from '@shared/pricing/rules';
import type { QuoteResult } from '@shared/pricing/types';
import { newIdempotencyKey } from '@/lib/idempotency';
import type { BookingDraftAddress, BookingDraftItem, PaymentMode, PortalService } from '../types';

export const STEPS = ['services', 'location', 'time', 'contact', 'review'] as const;
export type Step = (typeof STEPS)[number];

export interface DraftContact {
  name: string;
  email: string;
  /** National digits as typed (PhoneInput's raw value). */
  phoneRaw: string;
  phoneE164: string | null;
}

export interface DraftVerify {
  phone: string;
  token: string;
  expires_at: string;
}

export interface BookingDraft {
  version: 1;
  slug: string;
  idempotency_key: string;
  step: Step;
  items: BookingDraftItem[];
  address: BookingDraftAddress;
  slot: { start: string; end: string } | null;
  contact: DraftContact;
  verify: DraftVerify | null;
  notes: string;
  payment_mode: PaymentMode;
  created_at: string;
}

export type DraftAction =
  | { type: 'add_item'; item: BookingDraftItem }
  | { type: 'update_item'; key: string; patch: Partial<Omit<BookingDraftItem, 'key' | 'service_id'>> }
  | { type: 'remove_item'; key: string }
  | { type: 'set_address'; patch: Partial<BookingDraftAddress> }
  | { type: 'set_slot'; slot: BookingDraft['slot'] }
  | { type: 'set_contact'; patch: Partial<DraftContact> }
  | { type: 'set_verify'; verify: DraftVerify | null }
  | { type: 'set_notes'; notes: string }
  | { type: 'set_payment_mode'; mode: PaymentMode }
  | { type: 'go'; step: Step }
  | { type: 'reset' };

export const EMPTY_ADDRESS: BookingDraftAddress = { area: '', street: '', landmark: '', ward: '' };

export function newDraft(slug: string): BookingDraft {
  return {
    version: 1,
    slug,
    idempotency_key: newIdempotencyKey('booking'),
    step: 'services',
    items: [],
    address: { ...EMPTY_ADDRESS },
    slot: null,
    contact: { name: '', email: '', phoneRaw: '', phoneE164: null },
    verify: null,
    notes: '',
    payment_mode: 'ON_COMPLETION',
    created_at: new Date().toISOString(),
  };
}

let itemSeq = 0;
export function itemKey(): string {
  itemSeq += 1;
  return `item-${Date.now().toString(36)}-${itemSeq}`;
}

/** First sensible choice for each pricing model so the price appears immediately. */
export function defaultItem(service: PortalService): BookingDraftItem {
  const base: BookingDraftItem = { key: itemKey(), service_id: service.id, qty: 1, addons: [] };
  const parsed = PRICING_RULE_SCHEMAS[service.pricing_type].safeParse(service.pricing_rule);
  if (!parsed.success) return base;
  const rule = parsed.data as Record<string, unknown>;
  switch (service.pricing_type) {
    case 'PER_VARIANT': {
      const first = (rule.variants as { key: string }[] | undefined)?.[0];
      return first ? { ...base, variant: first.key } : base;
    }
    case 'PER_ROOM': {
      const first = (rule.rooms as { key: string }[] | undefined)?.[0];
      return first ? { ...base, rooms: { [first.key]: 1 } } : base;
    }
    case 'PER_AREA': {
      const first = (rule.ranges as { key: string }[] | undefined)?.[0];
      return first ? { ...base, area_range: first.key } : base;
    }
    case 'PER_SEAT': {
      const min = (rule.min_seats as number | undefined) ?? 1;
      return { ...base, qty: Math.max(1, min) };
    }
    case 'PER_UNIT': {
      const min = (rule.min_qty as number | undefined) ?? 1;
      return { ...base, qty: Math.max(1, min) };
    }
    default:
      return base;
  }
}

/** Steps whose inputs feed the price or the slot reset what depends on them. */
export function draftReducer(draft: BookingDraft, action: DraftAction): BookingDraft {
  switch (action.type) {
    case 'add_item':
      return { ...draft, items: [...draft.items, action.item], slot: null };
    case 'update_item':
      return {
        ...draft,
        items: draft.items.map((i) => (i.key === action.key ? { ...i, ...action.patch } : i)),
        slot: null,
      };
    case 'remove_item':
      return { ...draft, items: draft.items.filter((i) => i.key !== action.key), slot: null };
    case 'set_address':
      return { ...draft, address: { ...draft.address, ...action.patch }, slot: null };
    case 'set_slot':
      return { ...draft, slot: action.slot };
    case 'set_contact': {
      const contact = { ...draft.contact, ...action.patch };
      // A new number needs a new code.
      const verify = draft.verify && draft.verify.phone === contact.phoneE164 ? draft.verify : null;
      return { ...draft, contact, verify };
    }
    case 'set_verify':
      return { ...draft, verify: action.verify };
    case 'set_notes':
      return { ...draft, notes: action.notes };
    case 'set_payment_mode':
      return { ...draft, payment_mode: action.mode };
    case 'go':
      return { ...draft, step: action.step };
    case 'reset':
      return newDraft(draft.slug);
  }
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

export interface GateInput {
  draft: BookingDraft;
  quote: QuoteResult | null;
  now?: Date;
}

/** Whether a step's own requirements are met (so Continue is enabled). */
export function stepComplete(step: Step, { draft, quote, now = new Date() }: GateInput): boolean {
  switch (step) {
    case 'services':
      return draft.items.length > 0 && quote != null;
    case 'location': {
      const hasPlace =
        draft.address.area.trim().length > 0 || (draft.address.lat != null && draft.address.lng != null);
      return hasPlace && quote != null && !quote.out_of_area;
    }
    case 'time':
      return draft.slot != null || quote?.requires_review === true;
    case 'contact':
      return (
        draft.contact.name.trim().length >= 2 &&
        draft.verify != null &&
        draft.verify.phone === draft.contact.phoneE164 &&
        Date.parse(draft.verify.expires_at) > now.getTime()
      );
    case 'review':
      return true;
  }
}

/** The furthest step the visitor may jump to: every earlier step must be complete. */
export function reachableStep(input: GateInput): Step {
  for (const step of STEPS) {
    if (!stepComplete(step, input)) return step;
  }
  return 'review';
}

const STORAGE_PREFIX = 'safi360.portal.draft.';

export function loadDraft(slug: string): BookingDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    if (parsed.version !== 1 || parsed.slug !== slug || !parsed.idempotency_key) return null;
    return { ...newDraft(slug), ...parsed };
  } catch {
    return null;
  }
}

export function saveDraft(draft: BookingDraft): void {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + draft.slug, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the draft lives in memory for this page.
  }
}

export function clearDraft(slug: string): void {
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + slug);
  } catch {
    // ignore
  }
}

export function useBookingDraft(
  slug: string,
): [BookingDraft, (action: DraftAction) => void, { restored: boolean }] {
  const restored = useRef<boolean | null>(null);
  const [state, dispatch] = useReducer(draftReducer, slug, (s) => {
    const saved = loadDraft(s);
    restored.current = saved != null && saved.items.length > 0;
    return saved ?? newDraft(s);
  });
  useEffect(() => {
    saveDraft(state);
  }, [state]);
  return [state, dispatch, { restored: restored.current === true }];
}
