import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { PAY_TYPES } from '@shared/enums';
import { AmountInput } from '@/components/shared/AmountInput';
import { Field } from '@/components/shared/Field';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { CategoryRow, ServiceRow, ZoneRow } from '../catalog/types';
import { staffFormSchema, type StaffFormValues } from './staff-form-schema';

export interface StaffFormProps {
  initial: StaffFormValues;
  services: ServiceRow[];
  categories: CategoryRow[];
  zones: ZoneRow[];
  locale: 'sw' | 'en';
  isNew: boolean;
  saving: boolean;
  onSubmit: (values: StaffFormValues) => void;
  onCancel: () => void;
}

export function StaffForm({
  initial,
  services,
  categories,
  zones,
  locale,
  isNew,
  saving,
  onSubmit,
  onCancel,
}: StaffFormProps) {
  const { t } = useTranslation();
  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: initial,
    mode: 'onBlur',
  });
  const { register, control, handleSubmit, formState, watch } = form;
  const [submitted, setSubmitted] = useState(false);
  const payType = watch('pay_type');

  const err = (k: keyof StaffFormValues) => {
    const m = formState.errors[k]?.message;
    return m ? t(m) : undefined;
  };

  const grouped = [
    ...categories.map((c) => ({ id: c.id, name: c[`name_${locale}`] })),
    { id: null, name: t('catalog.field.no_category') },
  ]
    .map((c) => ({ ...c, services: services.filter((s) => s.active && s.category_id === c.id) }))
    .filter((c) => c.services.length > 0);

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) => {
        setSubmitted(true);
        onSubmit(v);
      })}
      className="space-y-6"
    >
      <UnsavedChangesGuard when={formState.isDirty && !submitted && !saving} />
      <Card>
        <CardHeader>
          <CardTitle>{t('staff.section.details')}</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field id="display_name" label={t('staff.field.name')} required error={err('display_name')}>
            <Input
              id="display_name"
              {...register('display_name')}
              invalid={!!err('display_name')}
              autoFocus={isNew}
            />
          </Field>
          <Controller
            name="phone_raw"
            control={control}
            render={({ field }) => (
              <PhoneInput
                id="phone"
                label={t('phone.label')}
                value={field.value}
                onChange={(raw, e164) => {
                  field.onChange(raw);
                  form.setValue('phone_e164', e164, { shouldDirty: true });
                }}
                onBlur={field.onBlur}
                error={err('phone_e164')}
                hint={t('staff.field.phone_hint')}
              />
            )}
          />
          <Field id="home_zone_id" label={t('staff.field.home_zone')}>
            <Select id="home_zone_id" {...register('home_zone_id')}>
              <option value="">{t('common.none')}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="pay_type" label={t('staff.field.pay_type')}>
            <Select id="pay_type" {...register('pay_type')}>
              <option value="">{t('common.none')}</option>
              {PAY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {t(`staff.pay_type.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          {payType && (
            <Controller
              name="pay_rate_tzs"
              control={control}
              render={({ field }) => (
                <AmountInput
                  id="pay_rate"
                  label={t('staff.field.pay_rate')}
                  value={field.value}
                  onChange={field.onChange}
                  required
                  error={err('pay_rate_tzs')}
                />
              )}
            />
          )}
          <div className="space-y-1 md:col-span-2">
            <Controller
              name="is_team_lead"
              control={control}
              render={({ field }) => (
                <Switch
                  id="is_team_lead"
                  label={t('staff.field.team_lead')}
                  description={t('staff.field.team_lead_hint')}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              name="active"
              control={control}
              render={({ field }) => (
                <Switch
                  id="staff-active"
                  label={t('common.active')}
                  description={t('staff.field.active_hint')}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('staff.section.skills')}</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="mb-2 text-sm text-text-subtle">{t('staff.skills_hint')}</p>
          {grouped.length === 0 ? (
            <p className="text-sm text-text-muted">{t('staff.no_services')}</p>
          ) : (
            <Controller
              name="skills"
              control={control}
              render={({ field }) => (
                <div className="grid gap-x-6 md:grid-cols-2">
                  {grouped.map((g) => (
                    <fieldset key={g.id ?? 'none'} className="mb-3">
                      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-text-subtle">
                        {g.name}
                      </legend>
                      {g.services.map((s) => (
                        <Checkbox
                          key={s.id}
                          label={s[`name_${locale}`]}
                          checked={field.value.includes(s.id)}
                          onChange={(e) =>
                            field.onChange(
                              e.target.checked
                                ? [...field.value, s.id]
                                : field.value.filter((x) => x !== s.id),
                            )
                          }
                          className="py-1"
                        />
                      ))}
                    </fieldset>
                  ))}
                </div>
              )}
            />
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving} loadingLabel={t('common.saving')}>
          {isNew ? t('staff.create') : t('common.save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
