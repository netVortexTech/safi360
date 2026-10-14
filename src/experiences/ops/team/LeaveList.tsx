import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatDay } from '@/lib/dates';
import type { AvailabilityRow, LeaveInput } from './api';

const leaveSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.required' }),
    date_to: z.string(),
    reason: z.string().trim().max(200, { message: 'validation.too_long' }),
  })
  .refine((v) => !v.date_to || v.date_to >= v.date, { message: 'validation.date_range', path: ['date_to'] });
type LeaveValues = z.infer<typeof leaveSchema>;

export interface LeaveListProps {
  rows: AvailabilityRow[];
  locale: 'sw' | 'en';
  saving: boolean;
  onAdd: (input: Omit<LeaveInput, 'staff_id'>, done: () => void) => void;
  onDelete: (id: string) => void;
}

export function LeaveList({ rows, locale, saving, onAdd, onDelete }: LeaveListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dated = rows.filter((r) => r.date != null).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const form = useForm<LeaveValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: { date: '', date_to: '', reason: '' },
  });
  const err = (k: keyof LeaveValues) => {
    const m = form.formState.errors[k]?.message;
    return m ? t(m) : undefined;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('availability.leave_title')}</CardTitle>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus aria-hidden="true" />
          {t('availability.add_leave')}
        </Button>
      </CardHeader>
      <CardBody>
        {dated.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-subtle" data-state="empty">
            <CalendarOff className="size-4" aria-hidden="true" />
            {t('availability.no_leave')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {dated.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-text">
                    {formatDay(r.date as string, locale)}
                    {r.date_to && r.date_to !== r.date ? ` – ${formatDay(r.date_to, locale)}` : ''}
                  </div>
                  <div className="text-xs text-text-subtle">
                    {r.is_off ? (
                      <Badge tone="warning">{t('availability.off')}</Badge>
                    ) : (
                      <Badge tone="info">
                        {t('availability.special_hours', {
                          start: r.start_time?.slice(0, 5),
                          end: r.end_time?.slice(0, 5),
                        })}
                      </Badge>
                    )}
                    {r.reason && <span className="ml-2">{r.reason}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.remove')}
                  onClick={() => onDelete(r.id)}
                  disabled={saving}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent>
          <form
            noValidate
            className="space-y-4"
            onSubmit={form.handleSubmit((v) =>
              onAdd({ date: v.date, date_to: v.date_to || null, reason: v.reason || null }, () => {
                form.reset();
                setOpen(false);
              }),
            )}
          >
            <DialogHeader>
              <DialogTitle>{t('availability.add_leave')}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="leave-date" label={t('availability.from')} required error={err('date')}>
                <Input id="leave-date" type="date" {...form.register('date')} invalid={!!err('date')} />
              </Field>
              <Field
                id="leave-date_to"
                label={t('availability.to')}
                hint={t('availability.to_hint')}
                error={err('date_to')}
              >
                <Input
                  id="leave-date_to"
                  type="date"
                  {...form.register('date_to')}
                  invalid={!!err('date_to')}
                />
              </Field>
            </div>
            <Field id="leave-reason" label={t('availability.reason')} error={err('reason')}>
              <Input
                id="leave-reason"
                {...form.register('reason')}
                placeholder={t('availability.reason_placeholder')}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={saving} loadingLabel={t('common.saving')}>
                {t('availability.add_leave')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
