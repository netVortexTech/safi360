import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatTzs } from '@/lib/money';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

interface PlanLimits {
  staff?: number;
  bookings_month?: number;
  reminders_month?: number;
}

interface PlanRow {
  id: string;
  name: string;
  price_tzs: number;
  limits: PlanLimits | null;
  active: boolean;
}

export default function ControlPlans() {
  const auth = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editTarget, setEditTarget] = useState<PlanRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const plansQuery = useQuery<PlanRow[]>({
    queryKey: ['control', 'plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('plans').select('id,name,price_tzs,limits,active');
      if (error) throw error;
      return data ?? [];
    },
    enabled: auth.claims.is_super_admin,
  });

  const updatePlan = useMutation({
    mutationFn: async (vars: { id: string; patch: Partial<PlanRow> }) => {
      const { error } = await supabase.from('plans').update(vars.patch).eq('id', vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control', 'plans'] });
      setEditTarget(null);
    },
  });

  const createPlan = useMutation({
    mutationFn: async (vars: { name: string; price_tzs: number; limits: PlanLimits }) => {
      const { error } = await supabase.from('plans').insert({ ...vars, active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['control', 'plans'] });
      setCreateOpen(false);
    },
  });

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.plans.forbidden')}
      </div>
    );
  }

  const rows = plansQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('control.plans.title')}
        subtitle={t('control.plans.subtitle')}
        actions={<Button onClick={() => setCreateOpen(true)}>{t('control.plans.create')}</Button>}
      />
      <Card>
        <CardBody className="space-y-4">
          {plansQuery.isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {plansQuery.error ? (
            <ErrorState
              title={t('control.plans.load_error')}
              description={String(plansQuery.error)}
              onRetry={() => void plansQuery.refetch()}
            />
          ) : null}
          {!plansQuery.isLoading && !plansQuery.error && rows.length === 0 ? (
            <EmptyState title={t('control.plans.empty')} description={t('control.plans.empty_hint')} />
          ) : null}
          {!plansQuery.isLoading && !plansQuery.error && rows.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.plans.name')}</TH>
                  <TH>{t('control.plans.price')}</TH>
                  <TH>{t('control.plans.limits')}</TH>
                  <TH>{t('control.plans.active')}</TH>
                  <TH>
                    <span className="sr-only">{t('control.plans.actions')}</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="tabular">{formatTzs(row.price_tzs)}</TD>
                    <TD className="text-xs text-text-muted">{formatLimits(row.limits)}</TD>
                    <TD>
                      <Badge tone={row.active ? 'success' : 'neutral'}>
                        {row.active ? t('control.plans.active_yes') : t('control.plans.active_no')}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditTarget(row)}>
                          {t('control.plans.edit')}
                        </Button>
                        <Switch
                          checked={row.active}
                          onCheckedChange={(checked) => {
                            void updatePlan.mutateAsync({ id: row.id, patch: { active: checked } });
                          }}
                          aria-label={t('control.plans.active')}
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : null}
          {updatePlan.error ? <p className="text-sm text-error">{String(updatePlan.error)}</p> : null}
        </CardBody>
      </Card>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('control.plans.edit')}</DialogTitle>
          </DialogHeader>
          {editTarget ? (
            <EditLimitsForm
              key={editTarget.id}
              plan={editTarget}
              saving={updatePlan.isPending}
              error={updatePlan.error ? String(updatePlan.error) : null}
              t={t}
              onCancel={() => setEditTarget(null)}
              onSave={(limits, price) => {
                void updatePlan.mutateAsync({ id: editTarget.id, patch: { limits, price_tzs: price } });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('control.plans.create')}</DialogTitle>
          </DialogHeader>
          <CreatePlanForm
            saving={createPlan.isPending}
            error={createPlan.error ? String(createPlan.error) : null}
            t={t}
            onCancel={() => setCreateOpen(false)}
            onSave={(vars) => {
              void createPlan.mutateAsync(vars);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatLimits(limits: PlanLimits | null): string {
  if (!limits) return '-';
  const parts: string[] = [];
  if (limits.staff != null) parts.push(`staff ${limits.staff}`);
  if (limits.bookings_month != null) parts.push(`bookings ${limits.bookings_month}/mo`);
  if (limits.reminders_month != null) parts.push(`reminders ${limits.reminders_month}/mo`);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

function EditLimitsForm({
  plan,
  saving,
  error,
  t,
  onCancel,
  onSave,
}: {
  plan: PlanRow;
  saving: boolean;
  error: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, opts?: any) => string;
  onCancel: () => void;
  onSave: (limits: PlanLimits, price: number) => void;
}) {
  const [price, setPrice] = useState(String(plan.price_tzs));
  const [staff, setStaff] = useState(String(plan.limits?.staff ?? ''));
  const [bookings, setBookings] = useState(String(plan.limits?.bookings_month ?? ''));
  const [reminders, setReminders] = useState(String(plan.limits?.reminders_month ?? ''));
  const priceNum = Number(price);
  const valid = price.trim() !== '' && Number.isInteger(priceNum) && priceNum >= 0;
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <Field id="edit-price" label={t('control.plans.price')} required>
        <Input id="edit-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field id="edit-staff" label={t('control.plans.limit_staff')}>
        <Input id="edit-staff" type="number" value={staff} onChange={(e) => setStaff(e.target.value)} />
      </Field>
      <Field id="edit-bookings" label={t('control.plans.limit_bookings')}>
        <Input
          id="edit-bookings"
          type="number"
          value={bookings}
          onChange={(e) => setBookings(e.target.value)}
        />
      </Field>
      <Field id="edit-reminders" label={t('control.plans.limit_reminders')}>
        <Input
          id="edit-reminders"
          type="number"
          value={reminders}
          onChange={(e) => setReminders(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!valid}
          loading={saving}
          onClick={() =>
            onSave(
              {
                ...(staff.trim() !== '' ? { staff: Number(staff) } : {}),
                ...(bookings.trim() !== '' ? { bookings_month: Number(bookings) } : {}),
                ...(reminders.trim() !== '' ? { reminders_month: Number(reminders) } : {}),
              },
              priceNum,
            )
          }
        >
          {t('common.save')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CreatePlanForm({
  saving,
  error,
  t,
  onCancel,
  onSave,
}: {
  saving: boolean;
  error: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: (key: string, opts?: any) => string;
  onCancel: () => void;
  onSave: (vars: { name: string; price_tzs: number; limits: PlanLimits }) => void;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [staff, setStaff] = useState('');
  const [bookings, setBookings] = useState('');
  const [reminders, setReminders] = useState('');
  const priceNum = Number(price);
  const valid = name.trim() !== '' && price.trim() !== '' && Number.isInteger(priceNum) && priceNum >= 0;
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <Field id="create-name" label={t('control.plans.name')} required>
        <Input id="create-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="create-price" label={t('control.plans.price')} required>
        <Input id="create-price" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field id="create-staff" label={t('control.plans.limit_staff')}>
        <Input id="create-staff" type="number" value={staff} onChange={(e) => setStaff(e.target.value)} />
      </Field>
      <Field id="create-bookings" label={t('control.plans.limit_bookings')}>
        <Input
          id="create-bookings"
          type="number"
          value={bookings}
          onChange={(e) => setBookings(e.target.value)}
        />
      </Field>
      <Field id="create-reminders" label={t('control.plans.limit_reminders')}>
        <Input
          id="create-reminders"
          type="number"
          value={reminders}
          onChange={(e) => setReminders(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!valid}
          loading={saving}
          onClick={() =>
            onSave({
              name: name.trim(),
              price_tzs: priceNum,
              limits: {
                ...(staff.trim() !== '' ? { staff: Number(staff) } : {}),
                ...(bookings.trim() !== '' ? { bookings_month: Number(bookings) } : {}),
                ...(reminders.trim() !== '' ? { reminders_month: Number(reminders) } : {}),
              },
            })
          }
        >
          {t('control.plans.create')}
        </Button>
      </DialogFooter>
    </div>
  );
}
