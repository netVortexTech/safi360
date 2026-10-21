import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, Plus, Trash2 } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { PricingType } from '@shared/enums';
import { PRICING_TYPE_ORDER } from '@shared/pricing/rules';
import type { TenantSettings } from '@shared/schemas';
import { AmountInput } from '@/components/shared/AmountInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Field } from '@/components/shared/Field';
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { PricePreview } from './PricePreview';
import { PricingRuleFields } from './PricingRuleFields';
import { draftForType, serviceFormSchema, type ServiceFormValues } from './service-form-schema';
import type { CategoryRow } from './types';

export interface ServiceFormProps {
  initial: ServiceFormValues;
  categories: CategoryRow[];
  settings: Pick<TenantSettings, 'deposit_pct' | 'quote_expiry_hours' | 'tax'>;
  locale: 'sw' | 'en';
  isNew: boolean;
  saving: boolean;
  archiving?: boolean | undefined;
  /** Server-side field errors (RHF paths → i18n keys) to map back onto fields. */
  serverErrors?: Record<string, string> | undefined;
  onSubmit: (values: ServiceFormValues) => void;
  onCancel: () => void;
  onArchive?: (() => void) | undefined;
  onAddCategory: () => void;
}

export function ServiceForm({
  initial,
  categories,
  settings,
  locale,
  isNew,
  saving,
  archiving,
  serverErrors,
  onSubmit,
  onCancel,
  onArchive,
  onAddCategory,
}: ServiceFormProps) {
  const { t } = useTranslation();
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: initial,
    mode: 'onBlur',
  });
  const { register, control, handleSubmit, formState, setValue, getValues, setError } = form;
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const values = useWatch({ control }) as ServiceFormValues;
  const type = values.pricing_type ?? initial.pricing_type;

  useEffect(() => {
    if (!serverErrors) return;
    for (const [path, message] of Object.entries(serverErrors)) {
      setError(path as keyof ServiceFormValues, { type: 'server', message });
    }
  }, [serverErrors, setError]);

  const addons = useFieldArray({ control, name: 'addons' });

  const choosePricingType = (next: PricingType) => {
    if (next === getValues('pricing_type')) return;
    setValue('pricing_type', next, { shouldDirty: true });
    setValue('pricing_rule', draftForType(next, getValues('pricing_rule')), { shouldDirty: true });
  };

  const err = (
    name:
      keyof ServiceFormValues | `duration.${'base_min' | 'per_unit_min' | 'per_sqm_min' | 'per_room_min'}`,
  ) => {
    const parts = name.split('.');
    const e = parts.reduce<unknown>(
      (acc, p) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[p] : undefined),
      formState.errors,
    );
    const message = (e as { message?: string } | undefined)?.message;
    return message ? t(message) : undefined;
  };
  const addonErr = (i: number, key: 'name_sw' | 'name_en' | 'price_tzs') => {
    const message = formState.errors.addons?.[i]?.[key]?.message;
    return message ? t(message) : undefined;
  };

  const showPerUnit = type === 'PER_UNIT' || type === 'PER_SEAT' || type === 'PER_VARIANT' || type === 'FLAT';

  return (
    <FormProvider {...form}>
      <UnsavedChangesGuard when={formState.isDirty && !submitted && !saving} />
      <form
        noValidate
        onSubmit={handleSubmit((v) => {
          setSubmitted(true);
          onSubmit(v);
        })}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start"
      >
        <div className="space-y-6">
          {/* 1. Pricing model first */}
          <Card>
            <CardHeader>
              <CardTitle>{t('catalog.section.pricing_model')}</CardTitle>
            </CardHeader>
            <CardBody>
              <div
                role="radiogroup"
                aria-label={t('catalog.section.pricing_model')}
                className="grid gap-2 sm:grid-cols-2"
              >
                {PRICING_TYPE_ORDER.map((pt) => {
                  const selected = type === pt;
                  return (
                    <button
                      key={pt}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => choosePricingType(pt)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        selected
                          ? 'border-primary bg-primary-light'
                          : 'border-border bg-surface hover:bg-surface-muted',
                      )}
                      data-pricing-type={pt}
                    >
                      <div className={cn('text-sm font-medium', selected ? 'text-primary' : 'text-text')}>
                        {t(`pricing_type.${pt}.label`)}
                      </div>
                      <div className="mt-0.5 text-xs text-text-subtle">
                        {t(`pricing_type.${pt}.description`)}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6" data-testid="pricing-rule-fields">
                <PricingRuleFields type={type} />
              </div>
            </CardBody>
          </Card>

          {/* 2. Names & category */}
          <Card>
            <CardHeader>
              <CardTitle>{t('catalog.section.details')}</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 md:grid-cols-2">
              <Field id="name_en" label={t('catalog.field.name_en')} required error={err('name_en')}>
                <Input id="name_en" {...register('name_en')} invalid={!!err('name_en')} autoFocus={isNew} />
              </Field>
              <Field id="name_sw" label={t('catalog.field.name_sw')} required error={err('name_sw')}>
                <Input id="name_sw" {...register('name_sw')} invalid={!!err('name_sw')} />
              </Field>
              <Field
                id="description_en"
                label={t('catalog.field.description_en')}
                error={err('description_en')}
              >
                <Textarea id="description_en" rows={2} {...register('description_en')} />
              </Field>
              <Field
                id="description_sw"
                label={t('catalog.field.description_sw')}
                error={err('description_sw')}
              >
                <Textarea id="description_sw" rows={2} {...register('description_sw')} />
              </Field>
              <div className="flex items-end gap-2">
                <Field id="category_id" label={t('catalog.field.category')} className="flex-1">
                  <Select id="category_id" {...register('category_id')}>
                    <option value="">{t('catalog.field.no_category')}</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c[`name_${locale}`]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="button" variant="secondary" onClick={onAddCategory} className="mb-5">
                  <Plus aria-hidden="true" />
                  {t('catalog.field.add_category')}
                </Button>
              </div>
              <Controller
                name="active"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="active"
                    label={t('catalog.field.active')}
                    description={t('catalog.field.active_hint')}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </CardBody>
          </Card>

          {/* 3. Duration & crew */}
          <Card>
            <CardHeader>
              <CardTitle>{t('catalog.section.duration')}</CardTitle>
            </CardHeader>
            <CardBody className="grid gap-4 md:grid-cols-3">
              <Field
                id="base_min"
                label={t('catalog.field.base_min')}
                required
                error={err('duration.base_min')}
              >
                <Input
                  id="base_min"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  {...register('duration.base_min', { valueAsNumber: true })}
                />
              </Field>
              {showPerUnit && (
                <Field
                  id="per_unit_min"
                  label={t('catalog.field.per_unit_min')}
                  error={err('duration.per_unit_min')}
                >
                  <Input
                    id="per_unit_min"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    {...register('duration.per_unit_min', { valueAsNumber: true })}
                  />
                </Field>
              )}
              {type === 'PER_AREA' && (
                <Field
                  id="per_sqm_min"
                  label={t('catalog.field.per_sqm_min')}
                  error={err('duration.per_sqm_min')}
                >
                  <Input
                    id="per_sqm_min"
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    {...register('duration.per_sqm_min', { valueAsNumber: true })}
                  />
                </Field>
              )}
              {type === 'PER_ROOM' && (
                <Field
                  id="per_room_min"
                  label={t('catalog.field.per_room_min')}
                  error={err('duration.per_room_min')}
                >
                  <Input
                    id="per_room_min"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    {...register('duration.per_room_min', { valueAsNumber: true })}
                  />
                </Field>
              )}
              <Field id="crew_size" label={t('catalog.field.crew_size')} required error={err('crew_size')}>
                <Input
                  id="crew_size"
                  type="number"
                  min={1}
                  max={20}
                  inputMode="numeric"
                  {...register('crew_size', { valueAsNumber: true })}
                />
              </Field>
              <Field
                id="recurrence_days"
                label={t('catalog.field.recurrence_days')}
                hint={t('catalog.field.recurrence_hint')}
                error={err('recurrence_days')}
              >
                <Input
                  id="recurrence_days"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  {...register('recurrence_days', {
                    setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)),
                  })}
                />
              </Field>
            </CardBody>
          </Card>

          {/* 4. Add-ons */}
          <Card>
            <CardHeader>
              <CardTitle>{t('catalog.section.addons')}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="mb-3 text-sm text-text-subtle">{t('catalog.addons_hint')}</p>
              <ul className="space-y-3">
                {addons.fields.map((f, i) => (
                  <li
                    key={f.id}
                    className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-[1fr_1fr_1fr_auto_auto] md:items-end"
                  >
                    <Field
                      id={`addon-${i}-name_en`}
                      label={t('catalog.addon.name_en')}
                      required
                      error={addonErr(i, 'name_en')}
                    >
                      <Input
                        id={`addon-${i}-name_en`}
                        {...register(`addons.${i}.name_en`)}
                        invalid={!!addonErr(i, 'name_en')}
                      />
                    </Field>
                    <Field
                      id={`addon-${i}-name_sw`}
                      label={t('catalog.addon.name_sw')}
                      required
                      error={addonErr(i, 'name_sw')}
                    >
                      <Input
                        id={`addon-${i}-name_sw`}
                        {...register(`addons.${i}.name_sw`)}
                        invalid={!!addonErr(i, 'name_sw')}
                      />
                    </Field>
                    <Controller
                      name={`addons.${i}.price_tzs`}
                      control={control}
                      render={({ field }) => (
                        <AmountInput
                          id={`addon-${i}-price`}
                          label={t('catalog.addon.price')}
                          value={field.value}
                          onChange={field.onChange}
                          required
                          error={addonErr(i, 'price_tzs')}
                        />
                      )}
                    />
                    <Controller
                      name={`addons.${i}.per_unit`}
                      control={control}
                      render={({ field }) => (
                        <div className="mb-5">
                          <Switch
                            id={`addon-${i}-per_unit`}
                            label={t('catalog.addon.per_unit')}
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </div>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.remove')}
                      onClick={() => addons.remove(i)}
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
                onClick={() =>
                  addons.append({ name_sw: '', name_en: '', price_tzs: null, per_unit: false, active: true })
                }
              >
                <Plus aria-hidden="true" />
                {t('catalog.addon.add')}
              </Button>
            </CardBody>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" loading={saving} loadingLabel={t('catalog.saving')}>
              {isNew ? t('catalog.create_service') : t('common.save')}
            </Button>
            <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
              {t('common.cancel')}
            </Button>
            {onArchive && (
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-error-text"
                onClick={() => setArchiveOpen(true)}
                disabled={saving}
              >
                <Archive aria-hidden="true" />
                {t('catalog.archive')}
              </Button>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-20">
          <PricePreview values={values.pricing_type ? values : initial} settings={settings} locale={locale} />
        </div>
      </form>

      {onArchive && (
        <ConfirmDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          title={t('catalog.archive_title')}
          description={t('catalog.archive_body')}
          confirmLabel={t('catalog.archive')}
          loadingLabel={t('catalog.archiving')}
          destructive
          loading={archiving}
          onConfirm={() => {
            setSubmitted(true);
            onArchive();
          }}
        />
      )}
    </FormProvider>
  );
}
