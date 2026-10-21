import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Slot } from '@shared/availability/slots';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDay, formatTime } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { addDaysKey } from '../util';

export interface SlotPickerProps {
  slots: Slot[];
  loading: boolean;
  /** "YYYY-MM-DD" of the first day shown. */
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  /** Earliest week allowed (today's). */
  minWeekStart: string;
  selectedStart: string | null;
  onSelect: (slot: Slot) => void;
  locale: 'sw' | 'en';
  className?: string;
}

/** Seven days as columns on wide screens, stacked on phones; chips per start time. */
export function SlotPicker({
  slots,
  loading,
  weekStart,
  onWeekChange,
  minWeekStart,
  selectedStart,
  onSelect,
  locale,
  className,
}: SlotPickerProps) {
  const { t } = useTranslation();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysKey(weekStart, i)), [weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [slots]);
  const dayLabel = (key: string) => formatDay(`${key}T12:00:00+03:00`, locale);
  const nothing = !loading && days.every((d) => (byDay.get(d) ?? []).length === 0);

  return (
    <div className={cn('space-y-3', className)} data-testid="slot-picker">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onWeekChange(addDaysKey(weekStart, -7))}
          disabled={weekStart <= minWeekStart}
        >
          <ChevronLeft aria-hidden="true" />
          {t('portal.time.prev_week')}
        </Button>
        <span className="text-sm text-text-muted">
          {t('portal.time.week_of', { date: dayLabel(weekStart) })}
        </span>
        <Button variant="secondary" size="sm" onClick={() => onWeekChange(addDaysKey(weekStart, 7))}>
          {t('portal.time.next_week')}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-7" aria-busy="true">
          {days.map((d) => (
            <div key={d} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <span className="sr-only">{t('portal.time.loading')}</span>
        </div>
      ) : nothing ? (
        <EmptyState title={t('portal.time.no_slots_title')} description={t('portal.time.no_slots_body')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-7 md:gap-2">
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={d} aria-label={dayLabel(d)} className="space-y-2">
                <h3 className="text-sm font-medium text-text">{dayLabel(d)}</h3>
                <ul className="flex flex-wrap gap-2 md:flex-col">
                  {list.map((s) => {
                    const selected = s.start === selectedStart;
                    return (
                      <li key={s.start}>
                        <button
                          type="button"
                          onClick={() => onSelect(s)}
                          aria-pressed={selected}
                          className={cn(
                            'flex h-touch min-w-24 flex-col items-center justify-center rounded border px-3 text-sm md:w-full',
                            selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-surface text-text hover:border-primary hover:bg-primary-light',
                          )}
                          data-slot-start={s.start}
                        >
                          <span className="tabular font-medium">{formatTime(s.start, locale)}</span>
                          <span
                            className={cn(
                              'text-xs',
                              selected ? 'text-primary-foreground/80' : 'text-text-subtle',
                            )}
                          >
                            {t('portal.time.capacity', { count: s.capacity })}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
