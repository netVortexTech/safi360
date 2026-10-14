import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { WeeklyRuleInput } from './api';
import { gridErrors, gridToRules, type DayRow, type GridState } from './availability-grid-model';

export interface AvailabilityGridProps {
  initial: GridState;
  saving: boolean;
  onSave: (rules: WeeklyRuleInput[]) => void;
}

export function AvailabilityGrid({ initial, saving, onSave }: AvailabilityGridProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<GridState>(initial);
  const [touched, setTouched] = useState(false);
  const errors = useMemo(() => gridErrors(state), [state]);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  const update = (weekday: number, patch: Partial<DayRow>) =>
    setState((s) => ({ ...s, days: s.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('availability.weekly_title')}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <Switch
          id="availability-custom"
          label={t('availability.custom_hours')}
          description={t('availability.custom_hours_hint')}
          checked={state.custom}
          onCheckedChange={(custom) => setState((s) => ({ ...s, custom }))}
        />
        {state.custom && (
          <ul
            className="divide-y divide-border rounded-lg border border-border"
            data-testid="availability-grid"
          >
            {state.days.map((d) => (
              <li key={d.weekday} className="grid items-center gap-3 p-3 sm:grid-cols-[7rem_1fr]">
                <Switch
                  id={`day-${d.weekday}`}
                  label={t(`weekday.${d.weekday}`)}
                  checked={d.works}
                  onCheckedChange={(works) => {
                    setTouched(true);
                    update(d.weekday, { works });
                  }}
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={d.start}
                    aria-label={t('availability.start', { day: t(`weekday.${d.weekday}`) })}
                    disabled={!d.works}
                    onChange={(e) => {
                      setTouched(true);
                      update(d.weekday, { start: e.target.value });
                    }}
                    className="w-32"
                  />
                  <span className="text-text-subtle">–</span>
                  <Input
                    type="time"
                    value={d.end}
                    aria-label={t('availability.end', { day: t(`weekday.${d.weekday}`) })}
                    disabled={!d.works}
                    onChange={(e) => {
                      setTouched(true);
                      update(d.weekday, { end: e.target.value });
                    }}
                    className="w-32"
                    invalid={touched && !!errors[d.weekday]}
                  />
                  {touched && errors[d.weekday] && (
                    <FieldError
                      id={`day-${d.weekday}-error`}
                      message={t(errors[d.weekday] ?? '')}
                      className="mt-0"
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              setTouched(true);
              if (Object.keys(errors).length === 0) onSave(gridToRules(state));
            }}
            loading={saving}
            loadingLabel={t('common.saving')}
            disabled={!dirty}
          >
            {t('availability.save_hours')}
          </Button>
          {dirty && (
            <Button type="button" variant="secondary" onClick={() => setState(initial)} disabled={saving}>
              {t('common.reset')}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
