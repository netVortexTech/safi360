import { MapPin, Phone } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { Input } from '@/components/ui/input';
import { formatTzs } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { usePortal } from '../context';
import type { LocalQuote } from '../hooks';
import type { BookingDraftAddress } from '../types';
import type { DraftAction } from './state';

export interface LocationStepProps {
  address: BookingDraftAddress;
  quote: LocalQuote;
  dispatch: (action: DraftAction) => void;
}

/** Step 2: the area decides the zone and travel fee; the rest gets the team to the door. */
export function LocationStep({ address, quote, dispatch }: LocationStepProps) {
  const { t } = useTranslation();
  const { catalog } = usePortal();
  const id = useId();
  const areas = useMemo(
    () =>
      [...new Set(catalog.zones.filter((z) => z.active).flatMap((z) => z.areas))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [catalog.zones],
  );
  const set = (patch: Partial<BookingDraftAddress>) => dispatch({ type: 'set_address', patch });
  const typed = address.area.trim().length > 0;
  const zone = quote.quote?.zone ?? null;
  const outOfArea = typed && quote.quote?.out_of_area === true;

  return (
    <section aria-labelledby="step-location" className="space-y-4">
      <div>
        <h2 id="step-location" className="text-h2">
          {t('portal.location.title')}
        </h2>
        <p className="text-sm text-text-muted">{t('portal.location.body')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          id={`${id}-area`}
          label={t('portal.location.area')}
          required
          hint={
            areas.length
              ? t('portal.location.area_hint', {
                  areas: areas.slice(0, 8).join(', ') + (areas.length > 8 ? '…' : ''),
                })
              : undefined
          }
          error={outOfArea ? t('portal.location.out_of_area_title') : undefined}
          className="md:col-span-2"
        >
          <Input
            id={`${id}-area`}
            list={`${id}-areas`}
            value={address.area}
            onChange={(e) => set({ area: e.target.value })}
            placeholder={t('portal.location.area_placeholder')}
            invalid={outOfArea}
            autoComplete="address-level3"
          />
          <datalist id={`${id}-areas`}>
            {areas.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
          {zone && !outOfArea && (
            <p
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-success-text"
              data-testid="zone-match"
            >
              <MapPin className="size-4" aria-hidden="true" />
              {t('portal.location.zone_matched', {
                zone: zone.name,
                fee:
                  zone.travel_fee_tzs > 0
                    ? t('portal.location.travel_fee', { fee: formatTzs(zone.travel_fee_tzs) })
                    : t('portal.location.no_travel_fee'),
              })}
            </p>
          )}
        </Field>
        <Field id={`${id}-street`} label={t('portal.location.street')}>
          <Input
            id={`${id}-street`}
            value={address.street}
            onChange={(e) => set({ street: e.target.value })}
            autoComplete="street-address"
          />
        </Field>
        <Field id={`${id}-ward`} label={t('portal.location.ward')}>
          <Input id={`${id}-ward`} value={address.ward} onChange={(e) => set({ ward: e.target.value })} />
        </Field>
        <Field id={`${id}-landmark`} label={t('portal.location.landmark')} className="md:col-span-2">
          <Input
            id={`${id}-landmark`}
            value={address.landmark}
            onChange={(e) => set({ landmark: e.target.value })}
            placeholder={t('portal.location.landmark_placeholder')}
          />
        </Field>
      </div>
      {outOfArea && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-tint/50 p-4"
          data-testid="out-of-area"
        >
          <h3 className="text-h3 text-warning-text">{t('portal.location.out_of_area_title')}</h3>
          <p className="mt-1 text-sm text-text-muted">{t('portal.location.out_of_area_body')}</p>
          <a
            href={`tel:${catalog.tenant.phone_e164}`}
            className="mt-3 inline-flex items-center gap-2 text-primary hover:underline"
          >
            <Phone className="size-4" aria-hidden="true" />
            {t('portal.hero.call', { phone: formatPhone(catalog.tenant.phone_e164) })}
          </a>
        </div>
      )}
    </section>
  );
}
