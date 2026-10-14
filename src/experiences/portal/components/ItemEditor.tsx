import { Minus, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { PRICING_RULE_SCHEMAS } from '@shared/pricing/rules';
import type { CatalogAddon } from '@shared/pricing/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatTzs } from '@/lib/money';
import { pick } from '../context';
import type { BookingDraftItem, Locale, PortalService } from '../types';

export interface ItemEditorProps {
  item: BookingDraftItem;
  service: PortalService;
  addons: CatalogAddon[];
  locale: Locale;
  onChange: (patch: Partial<Omit<BookingDraftItem, 'key' | 'service_id'>>) => void;
  onRemove: () => void;
  /** Engine error for this item, as an i18n key. */
  error?: string | null | undefined;
}

interface Option {
  key: string;
  label_sw: string;
  label_en: string;
  price_tzs: number;
}
interface Range {
  key: string;
  label_sw: string;
  label_en: string;
}

function Stepper({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field id={id} label={label}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`${label} −1`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Math.floor(Number(e.target.value)) || min)))}
          className="w-20 text-center"
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label={`${label} +1`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >
          <Plus aria-hidden="true" />
        </Button>
        <span className="sr-only">{t('common.required')}</span>
      </div>
    </Field>
  );
}

/** Only the inputs this service's pricing model needs, plus its add-ons. */
export function ItemEditor({ item, service, addons, locale, onChange, onRemove, error }: ItemEditorProps) {
  const { t } = useTranslation();
  const id = useId();
  const parsed = PRICING_RULE_SCHEMAS[service.pricing_type].safeParse(service.pricing_rule);
  const rule = (parsed.success ? parsed.data : {}) as Record<string, unknown>;
  const name = pick(service, locale);
  const label = (o: { label_sw: string; label_en: string }) => (locale === 'en' ? o.label_en : o.label_sw);
  const type = service.pricing_type;
  const review = type === 'INSPECTION_REQUIRED' || type === 'CUSTOM_QUOTE';

  return (
    <div
      className="rounded-lg border border-border bg-surface p-4"
      data-testid="item-editor"
      data-service={service.id}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-h3">{name}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('portal.stepper.remove', { name })}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(type === 'PER_UNIT' || type === 'PER_SEAT' || type === 'FLAT' || type === 'PER_VARIANT') && (
          <Stepper
            id={`${id}-qty`}
            label={type === 'PER_SEAT' ? t('portal.stepper.seats') : t('portal.stepper.qty')}
            value={item.qty}
            min={Math.max(1, Number(rule.min_seats ?? rule.min_qty ?? 1) || 1)}
            max={Math.min(999, Number(rule.max_qty ?? 999) || 999)}
            onChange={(qty) => onChange({ qty })}
          />
        )}
        {type === 'PER_VARIANT' && (
          <Field id={`${id}-variant`} label={t('portal.stepper.variant')} required>
            <Select
              id={`${id}-variant`}
              value={item.variant ?? ''}
              onChange={(e) => onChange({ variant: e.target.value })}
            >
              <option value="" disabled>
                {t('portal.stepper.choose')}
              </option>
              {((rule.variants as Option[] | undefined) ?? []).map((v) => (
                <option key={v.key} value={v.key}>
                  {label(v)} · {formatTzs(v.price_tzs)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {type === 'PER_ROOM' && (
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-medium text-text">{t('portal.stepper.rooms')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {((rule.rooms as Option[] | undefined) ?? []).map((r) => (
                <Stepper
                  key={r.key}
                  id={`${id}-room-${r.key}`}
                  label={`${label(r)} · ${formatTzs(r.price_tzs)}`}
                  value={item.rooms?.[r.key] ?? 0}
                  min={0}
                  max={99}
                  onChange={(n) => onChange({ rooms: { ...(item.rooms ?? {}), [r.key]: n } })}
                />
              ))}
            </div>
          </fieldset>
        )}
        {type === 'PER_AREA' && (
          <>
            <Field
              id={`${id}-range`}
              label={t('portal.stepper.area_range')}
              hint={t('portal.stepper.estimate_hint')}
            >
              <Select
                id={`${id}-range`}
                value={item.area_range ?? ''}
                onChange={(e) => onChange({ area_range: e.target.value || undefined, area_sqm: undefined })}
              >
                <option value="">{t('portal.stepper.choose')}</option>
                {((rule.ranges as Range[] | undefined) ?? []).map((r) => (
                  <option key={r.key} value={r.key}>
                    {label(r)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id={`${id}-sqm`}
              label={`${t('portal.stepper.area_or')} ${t('portal.stepper.area_exact')}`}
            >
              <Input
                id={`${id}-sqm`}
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                value={item.area_sqm ?? ''}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange(n > 0 ? { area_sqm: n, area_range: undefined } : { area_sqm: undefined });
                }}
              />
            </Field>
          </>
        )}
        {review && <p className="text-sm text-text-muted md:col-span-2">{t('portal.stepper.review_hint')}</p>}
        {addons.length > 0 && (
          <fieldset className="md:col-span-2">
            <legend className="mb-1 text-sm font-medium text-text">{t('portal.stepper.addons')}</legend>
            {addons.map((a) => {
              const on = item.addons.some((x) => x.addon_id === a.id);
              return (
                <Checkbox
                  key={a.id}
                  label={`${pick(a, locale)} · ${formatTzs(a.price_tzs)}${a.per_unit ? ` ${t('portal.services.per_unit')}` : ''}`}
                  checked={on}
                  onChange={(e) =>
                    onChange({
                      addons: e.target.checked
                        ? [...item.addons, { addon_id: a.id, qty: 1 }]
                        : item.addons.filter((x) => x.addon_id !== a.id),
                    })
                  }
                  className="py-1"
                />
              );
            })}
          </fieldset>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-error-text" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
