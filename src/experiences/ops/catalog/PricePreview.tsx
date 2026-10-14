import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { quote } from '@shared/pricing/quote';
import { QuoteError, type CatalogAddon, type CatalogService, type QuoteResult } from '@shared/pricing/types';
import type { TenantSettings } from '@shared/schemas';
import { Field } from '@/components/shared/Field';
import { PriceSummary } from '@/components/shared/PriceSummary';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { draftToRule, type ServiceFormValues } from './service-form-schema';

export interface PricePreviewProps {
  values: ServiceFormValues;
  settings: Pick<TenantSettings, 'deposit_pct' | 'quote_expiry_hours' | 'tax'>;
  locale: 'sw' | 'en';
}

const DRAFT_ID = '00000000-0000-4000-8000-00000000d7af';

/**
 * What the customer would pay, recomputed on every keystroke through the same quote()
 * the public booking page uses. Sample quantities are the preview's own controls.
 */
export function PricePreview({ values, settings, locale }: PricePreviewProps) {
  const { t } = useTranslation();
  // Raw strings so the owner can clear a box while typing; parsed when quoting.
  const [qtyRaw, setQtyRaw] = useState('1');
  const [variant, setVariant] = useState('');
  const [rooms, setRooms] = useState<Record<string, number>>({});
  const [areaRaw, setAreaRaw] = useState('100');
  const [addonIdx, setAddonIdx] = useState<number[]>([]);
  const qty = Math.min(999, Math.max(1, Math.floor(Number(qtyRaw)) || 1));
  const area = Math.max(1, Number(areaRaw) || 1);

  const result = useMemo<{ quote: QuoteResult | null; reason: string | null }>(() => {
    const service: CatalogService = {
      id: DRAFT_ID,
      name_sw: values.name_sw || t('catalog.preview.untitled'),
      name_en: values.name_en || t('catalog.preview.untitled'),
      pricing_type: values.pricing_type,
      pricing_rule: draftToRule(values.pricing_type, values.pricing_rule),
      duration_rule: values.duration,
      crew_size: values.crew_size,
      active: true,
    };
    const addons: CatalogAddon[] = values.addons.map((a, i) => ({
      id: `${DRAFT_ID.slice(0, -2)}${String(i).padStart(2, '0')}`,
      service_id: DRAFT_ID,
      name_sw: a.name_sw,
      name_en: a.name_en,
      price_tzs: a.price_tzs ?? 0,
      per_unit: a.per_unit,
      active: a.active,
    }));
    const chosenVariant = variant || values.pricing_rule.variants[0]?.key;
    const roomCounts =
      Object.keys(rooms).length > 0
        ? rooms
        : Object.fromEntries(values.pricing_rule.rooms.slice(0, 1).map((r) => [r.key, 1]));
    try {
      const q = quote(
        {
          items: [
            {
              service_id: DRAFT_ID,
              qty,
              ...(values.pricing_type === 'PER_VARIANT' && chosenVariant ? { variant: chosenVariant } : {}),
              ...(values.pricing_type === 'PER_ROOM' ? { rooms: roomCounts } : {}),
              ...(values.pricing_type === 'PER_AREA' ? { area_sqm: area } : {}),
              addons: addonIdx
                .filter((i) => addons[i]?.active)
                .map((i) => ({ addon_id: addons[i]!.id, qty: 1 })),
            },
          ],
        },
        { services: [service], addons, zones: [] },
        {
          deposit_pct: settings.deposit_pct,
          quote_expiry_hours: settings.quote_expiry_hours,
          tax: settings.tax,
          base: null,
          now: new Date(),
        },
      );
      return { quote: q, reason: null };
    } catch (err) {
      // A half-filled draft parses as an invalid rule; that is "keep typing", not a broken catalog.
      if (err instanceof QuoteError && err.code !== 'catalog_invalid') {
        return { quote: null, reason: `quote.error.${err.code}` };
      }
      if (err instanceof z.ZodError) return { quote: null, reason: 'catalog.preview.incomplete' };
      return { quote: null, reason: 'catalog.preview.incomplete' };
    }
  }, [values, qty, variant, rooms, area, addonIdx, settings, t]);

  const type = values.pricing_type;
  const showQty = type === 'PER_UNIT' || type === 'PER_SEAT' || type === 'PER_VARIANT' || type === 'FLAT';

  return (
    <aside className="space-y-4" aria-label={t('catalog.preview.title')} data-testid="price-preview">
      <h2 className="text-h3">{t('catalog.preview.title')}</h2>
      <p className="text-sm text-text-subtle">{t('catalog.preview.hint')}</p>

      <div className="grid gap-3 rounded-lg border border-dashed border-border p-3">
        {showQty && (
          <Field
            id="preview-qty"
            label={type === 'PER_SEAT' ? t('catalog.preview.seats') : t('catalog.preview.qty')}
          >
            <Input
              id="preview-qty"
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              value={qtyRaw}
              onChange={(e) => setQtyRaw(e.target.value)}
            />
          </Field>
        )}
        {type === 'PER_VARIANT' && values.pricing_rule.variants.length > 0 && (
          <Field id="preview-variant" label={t('catalog.preview.variant')}>
            <Select
              id="preview-variant"
              value={variant || values.pricing_rule.variants[0]?.key}
              onChange={(e) => setVariant(e.target.value)}
            >
              {values.pricing_rule.variants.map((v, i) => (
                <option key={`${v.key}-${i}`} value={v.key}>
                  {v[`label_${locale}`] || v.label_en || v.key}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {type === 'PER_ROOM' &&
          values.pricing_rule.rooms.map((r, i) => (
            <Field
              key={`${r.key}-${i}`}
              id={`preview-room-${i}`}
              label={r[`label_${locale}`] || r.label_en || r.key}
            >
              <Input
                id={`preview-room-${i}`}
                type="number"
                min={0}
                max={99}
                inputMode="numeric"
                value={rooms[r.key] ?? (i === 0 && Object.keys(rooms).length === 0 ? 1 : 0)}
                onChange={(e) => setRooms({ ...rooms, [r.key]: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
          ))}
        {type === 'PER_AREA' && (
          <Field id="preview-area" label={t('catalog.preview.area')}>
            <Input
              id="preview-area"
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              value={areaRaw}
              onChange={(e) => setAreaRaw(e.target.value)}
            />
          </Field>
        )}
        {values.addons.filter((a) => a.active).length > 0 && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-text">{t('catalog.preview.addons')}</legend>
            {values.addons.map((a, i) =>
              a.active ? (
                <Checkbox
                  key={i}
                  label={a[`name_${locale}`] || a.name_en || t('catalog.preview.untitled')}
                  checked={addonIdx.includes(i)}
                  onChange={(e) =>
                    setAddonIdx(e.target.checked ? [...addonIdx, i] : addonIdx.filter((x) => x !== i))
                  }
                  className="py-1"
                />
              ) : null,
            )}
          </fieldset>
        )}
      </div>

      {result.quote ? (
        <PriceSummary quote={result.quote} locale={locale} title={t('catalog.preview.customer_sees')} />
      ) : (
        <div
          className="rounded-lg border border-dashed border-border p-4 text-sm text-text-subtle"
          data-state="empty"
        >
          {t(result.reason ?? 'catalog.preview.incomplete')}
        </div>
      )}
    </aside>
  );
}
