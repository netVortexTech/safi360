import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';
import { useCategories, useServices, useZones } from '../../catalog/hooks';
import { gridFromRows } from '../availability-grid-model';
import { AvailabilityGrid } from '../AvailabilityGrid';
import {
  useAddLeave,
  useAvailability,
  useDeleteAvailability,
  useReplaceWeekly,
  useSaveStaff,
  useStaffMember,
} from '../hooks';
import { LeaveList } from '../LeaveList';
import { formToStaff, staffToForm } from '../staff-form-schema';
import { StaffForm } from '../StaffForm';

export default function StaffProfilePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'sw' ? 'sw' : 'en';
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const member = useStaffMember(id);
  const services = useServices();
  const categories = useCategories();
  const zones = useZones();
  const availability = useAvailability(id);
  const save = useSaveStaff();
  const replaceWeekly = useReplaceWeekly(id ?? '');
  const addLeave = useAddLeave(id ?? '');
  const deleteAvailability = useDeleteAvailability(id ?? '');

  const queries = [services, categories, zones, ...(isNew ? [] : [member, availability])];
  const pending = queries.some((q) => q.isPending);
  const failed = queries.find((q) => q.isError);

  const title = isNew ? t('staff.add') : (member.data?.display_name ?? t('staff.profile'));
  const failToast = (titleKey: string) => (e: unknown) =>
    toast({ title: t(titleKey), description: t(errorKey(e)), tone: 'error' });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('nav.team') },
          { label: t('nav.staff'), to: '/ops/staff' },
          { label: title },
        ]}
        title={title}
        badges={member.data?.is_team_lead ? <Badge tone="navy">{t('staff.team_lead')}</Badge> : undefined}
        subtitle={isNew ? t('staff.new_subtitle') : undefined}
      />
      {failed ? (
        <ErrorState
          description={t(errorKey(failed.error))}
          onRetry={() => void failed.refetch()}
          retrying={failed.isFetching}
        />
      ) : pending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <StaffForm
            key={member.data?.id ?? 'new'}
            initial={staffToForm(member.data ?? null)}
            services={services.data ?? []}
            categories={categories.data ?? []}
            zones={zones.data ?? []}
            locale={locale}
            isNew={isNew}
            saving={save.isPending}
            onCancel={() => void navigate('/ops/staff')}
            onSubmit={(v) =>
              save.mutate(formToStaff(v, id), {
                onSuccess: (saved) => {
                  toast({ title: t(isNew ? 'staff.created' : 'staff.saved', { name: saved.display_name }) });
                  if (isNew) void navigate(`/ops/staff/${saved.id}`, { replace: true });
                },
                onError: failToast('staff.save_failed'),
              })
            }
          />
          {!isNew && id && (
            <div className="space-y-6">
              <AvailabilityGrid
                key={availability.dataUpdatedAt}
                initial={gridFromRows(availability.data ?? [])}
                saving={replaceWeekly.isPending}
                onSave={(rules) =>
                  replaceWeekly.mutate(rules, {
                    onSuccess: () => toast({ title: t('availability.hours_saved') }),
                    onError: failToast('availability.save_failed'),
                  })
                }
              />
              <LeaveList
                rows={availability.data ?? []}
                locale={locale}
                saving={addLeave.isPending || deleteAvailability.isPending}
                onAdd={(input, done) =>
                  addLeave.mutate(input, {
                    onSuccess: () => {
                      toast({ title: t('availability.leave_added') });
                      done();
                    },
                    onError: failToast('availability.save_failed'),
                  })
                }
                onDelete={(rowId) =>
                  deleteAvailability.mutate(rowId, {
                    onSuccess: () => toast({ title: t('availability.leave_removed') }),
                    onError: failToast('availability.save_failed'),
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
