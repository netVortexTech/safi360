import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pick, usePortal } from '../context';
import { ItemEditor } from '../components/ItemEditor';
import { priceLabel } from '../util';
import type { LocalQuote } from '../hooks';
import type { BookingDraftItem } from '../types';
import { defaultItem, type DraftAction } from './state';

export interface ServicesStepProps {
  items: BookingDraftItem[];
  quote: LocalQuote;
  dispatch: (action: DraftAction) => void;
}

/** Step 1: pick services, set quantities/sizes/add-ons; the sticky total updates live. */
export function ServicesStep({ items, quote, dispatch }: ServicesStepProps) {
  const { t } = useTranslation();
  const { catalog, locale } = usePortal();
  const [pickerOpen, setPickerOpen] = useState(false);
  const services = useMemo(() => new Map(catalog.services.map((s) => [s.id, s])), [catalog.services]);
  const grouped = useMemo(() => {
    const cats = [...catalog.categories].sort((a, b) => a.sort - b.sort);
    const rows = cats.map((c) => ({
      category: c,
      services: catalog.services.filter((s) => s.category_id === c.id),
    }));
    const uncategorised = catalog.services.filter(
      (s) => !s.category_id || !cats.some((c) => c.id === s.category_id),
    );
    return [
      ...rows.filter((r) => r.services.length > 0),
      ...(uncategorised.length ? [{ category: null, services: uncategorised }] : []),
    ];
  }, [catalog]);

  const errorFor = (index: number) => (quote.path?.startsWith(`items.${index}`) ? quote.reason : null);

  const add = (serviceId: string) => {
    const s = services.get(serviceId);
    if (!s) return;
    dispatch({ type: 'add_item', item: defaultItem(s) });
    setPickerOpen(false);
  };

  return (
    <section aria-labelledby="step-services" className="space-y-4">
      <div>
        <h2 id="step-services" className="text-h2">
          {t('portal.stepper.your_services')}
        </h2>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title={t('portal.stepper.empty_title')}
          description={t('portal.stepper.empty_body')}
          actions={
            <Button variant="brand" onClick={() => setPickerOpen(true)}>
              <Plus aria-hidden="true" />
              {t('portal.stepper.add_service')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const service = services.get(item.service_id);
            if (!service) return null;
            return (
              <ItemEditor
                key={item.key}
                item={item}
                service={service}
                addons={catalog.addons.filter(
                  (a) => a.active && (a.service_id == null || a.service_id === service.id),
                )}
                locale={locale}
                onChange={(patch) => dispatch({ type: 'update_item', key: item.key, patch })}
                onRemove={() => dispatch({ type: 'remove_item', key: item.key })}
                error={errorFor(i)}
              />
            );
          })}
          <Button variant="tertiary" onClick={() => setPickerOpen(true)}>
            <Plus aria-hidden="true" />
            {t('portal.stepper.add_another')}
          </Button>
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>{t('portal.stepper.add_service')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4" data-testid="service-picker">
            {grouped.map(({ category, services: list }) => (
              <section key={category?.id ?? 'other'}>
                {category && (
                  <h3 className="mb-2 text-sm font-medium text-text-muted">{pick(category, locale)}</h3>
                )}
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => add(s.id)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="block text-base text-text">{pick(s, locale)}</span>
                          <span className="block text-xs text-text-subtle">{priceLabel(s, locale, t)}</span>
                        </span>
                        <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
