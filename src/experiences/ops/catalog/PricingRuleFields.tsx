import { Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, useFormContext, type FieldError as RhfFieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { PricingType } from '@shared/enums';
import { AmountInput } from '@/components/shared/AmountInput';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { keyFromLabel, type ServiceFormValues } from './service-form-schema';

type Errors = Record<string, unknown>;

function msg(err: unknown, t: (k: string) => string): string | undefined {
  const e = err as RhfFieldError | undefined;
  return e?.message ? t(e.message) : undefined;
}

function nested(errors: Errors | undefined, path: (string | number)[]): unknown {
  return path.reduce<unknown>(
    (acc, p) => (acc && typeof acc === 'object' ? (acc as Errors)[p] : undefined),
    errors,
  );
}

// RHF also runs setValueAs on the default value, which may be null: never turn that into 0.
const nullableNumber = (v: unknown) => (v === '' || v == null ? null : Number(v));

/** Only the fields that matter for the chosen pricing model (brief: "pricing model first"). */
export function PricingRuleFields({ type }: { type: PricingType }) {
  const { t } = useTranslation();
  const { register, control, formState } = useFormContext<ServiceFormValues>();
  const errors = formState.errors.pricing_rule as Errors | undefined;
  const ruleError = (key: string) => msg(nested(errors, [key]), t);

  const money = (
    name: 'price_tzs' | 'min_charge_tzs' | 'from_price_tzs',
    label: string,
    required = false,
    hint?: string,
  ) => (
    <Controller
      name={`pricing_rule.${name}`}
      control={control}
      render={({ field }) => (
        <AmountInput
          id={`rule-${name}`}
          label={label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          required={required}
          error={ruleError(name)}
          hint={hint}
        />
      )}
    />
  );

  const minCharge = money(
    'min_charge_tzs',
    t('catalog.rule.min_charge'),
    false,
    t('catalog.rule.min_charge_hint'),
  );

  switch (type) {
    case 'FLAT':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {money('price_tzs', t('catalog.rule.flat_price'), true)}
        </div>
      );

    case 'PER_UNIT':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="rule-unit_en" label={t('catalog.rule.unit_en')} required error={ruleError('unit_en')}>
            <Input
              id="rule-unit_en"
              {...register('pricing_rule.unit_en')}
              invalid={!!ruleError('unit_en')}
              placeholder={t('catalog.rule.unit_en_placeholder')}
            />
          </Field>
          <Field id="rule-unit_sw" label={t('catalog.rule.unit_sw')} required error={ruleError('unit_sw')}>
            <Input
              id="rule-unit_sw"
              {...register('pricing_rule.unit_sw')}
              invalid={!!ruleError('unit_sw')}
              placeholder={t('catalog.rule.unit_sw_placeholder')}
            />
          </Field>
          {money('price_tzs', t('catalog.rule.price_per_unit'), true)}
          {minCharge}
          <Field id="rule-min_qty" label={t('catalog.rule.min_qty')} error={ruleError('min_qty')}>
            <Input
              id="rule-min_qty"
              type="number"
              min={1}
              inputMode="numeric"
              {...register('pricing_rule.min_qty', { setValueAs: nullableNumber })}
            />
          </Field>
          <Field id="rule-max_qty" label={t('catalog.rule.max_qty')} error={ruleError('max_qty')}>
            <Input
              id="rule-max_qty"
              type="number"
              min={1}
              inputMode="numeric"
              {...register('pricing_rule.max_qty', { setValueAs: nullableNumber })}
            />
          </Field>
        </div>
      );

    case 'PER_SEAT':
      return (
        <div className="grid gap-4 md:grid-cols-2">
          {money('price_tzs', t('catalog.rule.price_per_seat'), true)}
          {minCharge}
          <Field id="rule-min_seats" label={t('catalog.rule.min_seats')} error={ruleError('min_seats')}>
            <Input
              id="rule-min_seats"
              type="number"
              min={1}
              inputMode="numeric"
              {...register('pricing_rule.min_seats', { setValueAs: nullableNumber })}
            />
          </Field>
        </div>
      );

    case 'PER_VARIANT':
      return (
        <div className="space-y-4">
          <OptionList
            name="variants"
            title={t('catalog.rule.variants')}
            addLabel={t('catalog.rule.add_variant')}
          />
          <div className="grid gap-4 md:grid-cols-2">{minCharge}</div>
        </div>
      );

    case 'PER_ROOM':
      return (
        <div className="space-y-4">
          <OptionList name="rooms" title={t('catalog.rule.rooms')} addLabel={t('catalog.rule.add_room')} />
          <div className="grid gap-4 md:grid-cols-2">{minCharge}</div>
        </div>
      );

    case 'PER_AREA':
      return (
        <div className="space-y-6">
          <Field
            id="rule-tier_mode"
            label={t('catalog.rule.tier_mode')}
            hint={t('catalog.rule.tier_mode_hint')}
          >
            <Select id="rule-tier_mode" {...register('pricing_rule.tier_mode')}>
              <option value="bracket">{t('catalog.rule.tier_mode_bracket')}</option>
              <option value="marginal">{t('catalog.rule.tier_mode_marginal')}</option>
            </Select>
          </Field>
          <TierList />
          <RangeList />
          <div className="grid gap-4 md:grid-cols-2">{minCharge}</div>
        </div>
      );

    case 'INSPECTION_REQUIRED':
    case 'CUSTOM_QUOTE':
      return (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">{t(`pricing_type.${type}.editor_hint`)}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {money('from_price_tzs', t('catalog.rule.from_price'), false, t('catalog.rule.from_price_hint'))}
          </div>
        </div>
      );
  }
}

function OptionList({
  name,
  title,
  addLabel,
}: {
  name: 'variants' | 'rooms';
  title: string;
  addLabel: string;
}) {
  const { t } = useTranslation();
  const { register, control, formState, getValues, setValue } = useFormContext<ServiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: `pricing_rule.${name}` });
  const errors = formState.errors.pricing_rule as Errors | undefined;
  const listError = msg(nested(errors, [name]), t);
  const itemError = (i: number, key: string) => msg(nested(errors, [name, i, key]), t);

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-text">{title}</legend>
      {listError && (
        <p className="mb-2 text-sm text-error-text" role="alert">
          {listError}
        </p>
      )}
      <ul className="space-y-3">
        {fields.map((f, i) => (
          <li
            key={f.id}
            className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end"
          >
            <Field
              id={`${name}-${i}-label_en`}
              label={t('catalog.rule.option_label_en')}
              required
              error={itemError(i, 'label_en')}
            >
              <Input
                id={`${name}-${i}-label_en`}
                {...register(`pricing_rule.${name}.${i}.label_en`, {
                  onBlur: () => {
                    if (!getValues(`pricing_rule.${name}.${i}.key`)) {
                      setValue(
                        `pricing_rule.${name}.${i}.key`,
                        keyFromLabel(getValues(`pricing_rule.${name}.${i}.label_en`)),
                        { shouldDirty: true },
                      );
                    }
                  },
                })}
                invalid={!!itemError(i, 'label_en')}
              />
            </Field>
            <Field
              id={`${name}-${i}-label_sw`}
              label={t('catalog.rule.option_label_sw')}
              required
              error={itemError(i, 'label_sw')}
            >
              <Input
                id={`${name}-${i}-label_sw`}
                {...register(`pricing_rule.${name}.${i}.label_sw`)}
                invalid={!!itemError(i, 'label_sw')}
              />
            </Field>
            <Controller
              name={`pricing_rule.${name}.${i}.price_tzs`}
              control={control}
              render={({ field }) => (
                <AmountInput
                  id={`${name}-${i}-price`}
                  label={t('catalog.rule.option_price')}
                  value={field.value}
                  onChange={field.onChange}
                  required
                  error={itemError(i, 'price_tzs')}
                />
              )}
            />
            <Field
              id={`${name}-${i}-key`}
              label={t('catalog.rule.option_key')}
              error={itemError(i, 'key')}
              className="md:w-32"
            >
              <Input
                id={`${name}-${i}-key`}
                {...register(`pricing_rule.${name}.${i}.key`)}
                invalid={!!itemError(i, 'key')}
                className="font-mono text-sm"
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.remove')}
              onClick={() => remove(i)}
              className="mb-5"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        className="mt-3"
        onClick={() => append({ key: '', label_sw: '', label_en: '', price_tzs: null })}
      >
        <Plus aria-hidden="true" />
        {addLabel}
      </Button>
    </fieldset>
  );
}

function TierList() {
  const { t } = useTranslation();
  const { register, control, formState } = useFormContext<ServiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pricing_rule.tiers' });
  const errors = formState.errors.pricing_rule as Errors | undefined;
  const listError = msg(nested(errors, ['tiers']), t);
  const itemError = (i: number, key: string) => msg(nested(errors, ['tiers', i, key]), t);

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-text">{t('catalog.rule.tiers')}</legend>
      <p className="mb-2 text-sm text-text-subtle">{t('catalog.rule.tiers_hint')}</p>
      {listError && (
        <p className="mb-2 text-sm text-error-text" role="alert">
          {listError}
        </p>
      )}
      <ul className="space-y-3">
        {fields.map((f, i) => (
          <li
            key={f.id}
            className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
          >
            <Field
              id={`tier-${i}-up_to`}
              label={t('catalog.rule.tier_up_to')}
              hint={i === fields.length - 1 ? t('catalog.rule.tier_open_hint') : undefined}
              error={itemError(i, 'up_to_sqm')}
            >
              <Input
                id={`tier-${i}-up_to`}
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                {...register(`pricing_rule.tiers.${i}.up_to_sqm`, { setValueAs: nullableNumber })}
                invalid={!!itemError(i, 'up_to_sqm')}
              />
            </Field>
            <Controller
              name={`pricing_rule.tiers.${i}.price_tzs`}
              control={control}
              render={({ field }) => (
                <AmountInput
                  id={`tier-${i}-price`}
                  label={t('catalog.rule.tier_price')}
                  value={field.value}
                  onChange={field.onChange}
                  required
                  error={itemError(i, 'price_tzs')}
                />
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.remove')}
              onClick={() => remove(i)}
              className="mb-5"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        className="mt-3"
        onClick={() => append({ up_to_sqm: null, price_tzs: null })}
      >
        <Plus aria-hidden="true" />
        {t('catalog.rule.add_tier')}
      </Button>
    </fieldset>
  );
}

function RangeList() {
  const { t } = useTranslation();
  const { register, control, formState, getValues, setValue } = useFormContext<ServiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pricing_rule.ranges' });
  const errors = formState.errors.pricing_rule as Errors | undefined;
  const itemError = (i: number, key: string) => msg(nested(errors, ['ranges', i, key]), t);

  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-text">{t('catalog.rule.ranges')}</legend>
      <p className="mb-2 text-sm text-text-subtle">{t('catalog.rule.ranges_hint')}</p>
      <ul className="space-y-3">
        {fields.map((f, i) => (
          <li
            key={f.id}
            className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_5rem_5rem_5rem_auto] md:items-end"
          >
            <Field
              id={`range-${i}-label_en`}
              label={t('catalog.rule.option_label_en')}
              required
              error={itemError(i, 'label_en')}
            >
              <Input
                id={`range-${i}-label_en`}
                {...register(`pricing_rule.ranges.${i}.label_en`, {
                  onBlur: () => {
                    if (!getValues(`pricing_rule.ranges.${i}.key`)) {
                      setValue(
                        `pricing_rule.ranges.${i}.key`,
                        keyFromLabel(getValues(`pricing_rule.ranges.${i}.label_en`)),
                        { shouldDirty: true },
                      );
                    }
                  },
                })}
              />
            </Field>
            <Field
              id={`range-${i}-label_sw`}
              label={t('catalog.rule.option_label_sw')}
              required
              error={itemError(i, 'label_sw')}
            >
              <Input id={`range-${i}-label_sw`} {...register(`pricing_rule.ranges.${i}.label_sw`)} />
            </Field>
            <Field id={`range-${i}-min`} label={t('catalog.rule.range_min')} error={itemError(i, 'min_sqm')}>
              <Input
                id={`range-${i}-min`}
                type="number"
                min={0}
                step="any"
                {...register(`pricing_rule.ranges.${i}.min_sqm`, { setValueAs: nullableNumber })}
              />
            </Field>
            <Field id={`range-${i}-max`} label={t('catalog.rule.range_max')} error={itemError(i, 'max_sqm')}>
              <Input
                id={`range-${i}-max`}
                type="number"
                min={1}
                step="any"
                {...register(`pricing_rule.ranges.${i}.max_sqm`, { setValueAs: nullableNumber })}
              />
            </Field>
            <Field
              id={`range-${i}-assumed`}
              label={t('catalog.rule.range_assumed')}
              required
              error={itemError(i, 'assumed_sqm')}
            >
              <Input
                id={`range-${i}-assumed`}
                type="number"
                min={1}
                step="any"
                {...register(`pricing_rule.ranges.${i}.assumed_sqm`, { setValueAs: nullableNumber })}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('common.remove')}
              onClick={() => remove(i)}
              className="mb-5"
            >
              <Trash2 aria-hidden="true" />
            </Button>
            <input type="hidden" {...register(`pricing_rule.ranges.${i}.key`)} />
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        className="mt-3"
        onClick={() =>
          append({ key: '', label_sw: '', label_en: '', min_sqm: 0, max_sqm: null, assumed_sqm: null })
        }
      >
        <Plus aria-hidden="true" />
        {t('catalog.rule.add_range')}
      </Button>
    </fieldset>
  );
}
