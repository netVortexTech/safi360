import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Plus, Trash2 } from '@/components/ui/icons';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { AmountInput } from '@/components/shared/AmountInput';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataView, type DataColumn } from '@/components/shared/DataView';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';
import { formatTzs } from '@/lib/money';
import { useCurrentTenant } from '@/lib/tenant';
import { CatalogTabs } from '../CatalogTabs';
import { useDeleteZone, useSaveZone, useZones } from '../hooks';
import type { ZoneRow } from '../types';

const zoneSchema = z.object({
  name: z.string().trim().min(1, { message: 'validation.required' }).max(80),
  /** One area per line or comma-separated. */
  areas: z.string(),
  travel_fee_tzs: z.number().nullable(),
  max_km: z.number().positive({ message: 'validation.out_of_range' }).nullable(),
  serviceable: z.boolean(),
  active: z.boolean(),
});
type ZoneValues = z.infer<typeof zoneSchema>;

function toValues(z?: ZoneRow): ZoneValues {
  return {
    name: z?.name ?? '',
    areas: z?.areas.join('\n') ?? '',
    travel_fee_tzs: z?.travel_fee_tzs ?? 0,
    max_km: z?.max_km ?? null,
    serviceable: z?.serviceable ?? true,
    active: z?.active ?? true,
  };
}

function splitAreas(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

export default function ServiceAreasPage() {
  const { t } = useTranslation();
  const zones = useZones();
  const tenant = useCurrentTenant();
  const [editing, setEditing] = useState<ZoneRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ZoneRow | null>(null);
  const del = useDeleteZone();
  const { toast } = useToast();

  const columns: DataColumn<ZoneRow>[] = [
    { key: 'name', header: t('zones.col.name'), cell: (z) => <span className="font-medium">{z.name}</span> },
    {
      key: 'areas',
      header: t('zones.col.areas'),
      cell: (z) => (
        <div className="flex flex-wrap gap-1">
          {z.areas.slice(0, 6).map((a) => (
            <Badge key={a} tone="outline">
              {a}
            </Badge>
          ))}
          {z.areas.length > 6 && <Badge tone="neutral">+{z.areas.length - 6}</Badge>}
          {z.polygon && <Badge tone="info">{t('zones.polygon')}</Badge>}
        </div>
      ),
    },
    {
      key: 'band',
      header: t('zones.col.band'),
      cell: (z) => (z.max_km == null ? t('common.not_available') : t('zones.within_km', { km: z.max_km })),
    },
    {
      key: 'fee',
      header: t('zones.col.fee'),
      cell: (z) => (z.travel_fee_tzs === 0 ? t('zones.free') : formatTzs(z.travel_fee_tzs)),
      align: 'right',
    },
    {
      key: 'status',
      header: t('catalog.col.status'),
      cell: (z) =>
        !z.active ? (
          <Badge tone="neutral">{t('common.inactive')}</Badge>
        ) : z.serviceable ? (
          <Badge tone="success">{t('zones.serviceable')}</Badge>
        ) : (
          <Badge tone="warning">{t('zones.callback_only')}</Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (z) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('zones.delete', { name: z.name })}
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(z);
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ),
    },
  ];

  const state = zones.isPending
    ? 'loading'
    : zones.isError
      ? 'error'
      : (zones.data?.length ?? 0) === 0
        ? 'empty'
        : 'data';

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('nav.catalog') },
          { label: t('nav.services_pricing'), to: '/ops/services' },
          { label: t('nav.service_areas') },
        ]}
        title={t('nav.service_areas')}
        subtitle={t('zones.subtitle')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            {t('zones.add')}
          </Button>
        }
      />
      <CatalogTabs />

      {tenant.data && tenant.data.base_lat == null && (
        <p
          className="mb-4 flex items-start gap-2 rounded-lg border border-info/40 bg-info-tint/50 p-3 text-sm text-info-text"
          role="note"
        >
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('zones.no_base_hint')}
        </p>
      )}

      <DataView
        state={state}
        rows={zones.data ?? []}
        columns={columns}
        rowKey={(z) => z.id}
        caption={t('nav.service_areas')}
        onRowClick={(z) => setEditing(z)}
        renderCard={(z) => (
          <button
            type="button"
            onClick={() => setEditing(z)}
            className="block w-full rounded-lg border border-border bg-surface p-4 text-left shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-text">{z.name}</div>
              {columns[4]?.cell(z)}
            </div>
            <div className="mt-1 text-xs text-text-subtle">{z.areas.join(' · ')}</div>
            <div className="tabular mt-2 text-sm">
              {z.travel_fee_tzs === 0 ? t('zones.free') : formatTzs(z.travel_fee_tzs)}
            </div>
          </button>
        )}
        empty={
          <EmptyState
            icon={<MapPin />}
            title={t('zones.empty_title')}
            description={t('zones.empty_body')}
            actions={
              <Button onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" />
                {t('zones.add')}
              </Button>
            }
          />
        }
        error={
          <ErrorState
            description={t(errorKey(zones.error))}
            onRetry={() => void zones.refetch()}
            retrying={zones.isFetching}
          />
        }
      />

      <ZoneDialog
        zone={editing === 'new' ? null : editing}
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
      />

      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('zones.delete_title', { name: deleting?.name ?? '' })}
        description={t('zones.delete_body')}
        confirmLabel={t('common.delete')}
        loadingLabel={t('common.deleting')}
        destructive
        loading={del.isPending}
        onConfirm={() =>
          deleting &&
          del.mutate(deleting.id, {
            onSuccess: () => {
              toast({ title: t('zones.deleted', { name: deleting.name }) });
              setDeleting(null);
            },
            onError: (e) =>
              toast({ title: t('errors.generic_title'), description: t(errorKey(e)), tone: 'error' }),
          })
        }
      />
    </>
  );
}

function ZoneDialog({
  zone,
  open,
  onOpenChange,
}: {
  zone: ZoneRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation();
  const save = useSaveZone();
  const { toast } = useToast();
  const form = useForm<ZoneValues>({
    resolver: zodResolver(zoneSchema),
    defaultValues: toValues(zone ?? undefined),
  });
  const { register, control, handleSubmit, formState, reset } = form;

  useEffect(() => {
    if (open) reset(toValues(zone ?? undefined));
  }, [open, zone, reset]);

  const err = (k: keyof ZoneValues) => {
    const m = formState.errors[k]?.message;
    return m ? t(m) : undefined;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent variant="sheet">
        <form
          noValidate
          className="space-y-4"
          onSubmit={handleSubmit((v) =>
            save.mutate(
              {
                id: zone?.id,
                name: v.name,
                areas: splitAreas(v.areas),
                polygon: zone?.polygon ?? null,
                max_km: v.max_km,
                travel_fee_tzs: v.travel_fee_tzs ?? 0,
                serviceable: v.serviceable,
                active: v.active,
                sort: zone?.sort ?? 0,
              },
              {
                onSuccess: (saved) => {
                  toast({ title: t('zones.saved', { name: saved.name }) });
                  onOpenChange(false);
                },
                onError: (e) =>
                  toast({ title: t('errors.generic_title'), description: t(errorKey(e)), tone: 'error' }),
              },
            ),
          )}
        >
          <DialogHeader>
            <DialogTitle>{zone ? t('zones.edit') : t('zones.add')}</DialogTitle>
          </DialogHeader>
          <Field id="zone-name" label={t('zones.field.name')} required error={err('name')}>
            <Input id="zone-name" {...register('name')} invalid={!!err('name')} autoFocus />
          </Field>
          <Field
            id="zone-areas"
            label={t('zones.field.areas')}
            hint={t('zones.field.areas_hint')}
            error={err('areas')}
          >
            <Textarea id="zone-areas" rows={3} {...register('areas')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="travel_fee_tzs"
              control={control}
              render={({ field }) => (
                <AmountInput
                  id="zone-fee"
                  label={t('zones.field.fee')}
                  value={field.value}
                  onChange={field.onChange}
                  error={err('travel_fee_tzs')}
                />
              )}
            />
            <Field
              id="zone-max_km"
              label={t('zones.field.max_km')}
              hint={t('zones.field.max_km_hint')}
              error={err('max_km')}
            >
              <Input
                id="zone-max_km"
                type="number"
                min={1}
                step="any"
                inputMode="decimal"
                {...register('max_km', {
                  setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)),
                })}
              />
            </Field>
          </div>
          <Controller
            name="serviceable"
            control={control}
            render={({ field }) => (
              <Switch
                id="zone-serviceable"
                label={t('zones.field.serviceable')}
                description={t('zones.field.serviceable_hint')}
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
                id="zone-active"
                label={t('common.active')}
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={save.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} loadingLabel={t('common.saving')}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
