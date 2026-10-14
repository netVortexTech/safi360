import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/shared/ErrorState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';
import { useCurrentTenant } from '@/lib/tenant';
import { CategoryDialog } from '../CategoryDialog';
import { useArchiveService, useCategories, useSaveService, useService, useServiceAddons } from '../hooks';
import { ServiceForm } from '../ServiceForm';
import {
  emptyServiceForm,
  formToService,
  serviceToForm,
  type ServiceFormValues,
} from '../service-form-schema';

export default function ServiceEditorPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'sw' ? 'sw' : 'en';
  const { id } = useParams<{ id: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();

  const service = useService(id);
  const addons = useServiceAddons(id);
  const categories = useCategories();
  const tenant = useCurrentTenant();
  const save = useSaveService();
  const archive = useArchiveService();
  const [categoryOpen, setCategoryOpen] = useState(false);

  const queries = [categories, tenant, ...(isNew ? [] : [service, addons])];
  const pending = queries.some((q) => q.isPending);
  const failed = queries.find((q) => q.isError);

  const initial = useMemo<ServiceFormValues | null>(() => {
    if (isNew) return emptyServiceForm();
    if (!service.data || !addons.data) return null;
    return serviceToForm(service.data, addons.data);
  }, [isNew, service.data, addons.data]);

  const title = isNew
    ? t('catalog.new_service')
    : (service.data?.[`name_${locale}`] ?? t('catalog.edit_service'));

  const onSubmit = (values: ServiceFormValues) => {
    const existing = service.data ? { id: service.data.id, sort: service.data.sort } : null;
    save.mutate(
      {
        service: formToService(values, existing),
        addons: values.addons.map((a) => ({
          id: a.id,
          name_sw: a.name_sw,
          name_en: a.name_en,
          price_tzs: a.price_tzs ?? 0,
          per_unit: a.per_unit,
          active: a.active,
          sort: 0,
        })),
      },
      {
        onSuccess: ({ service: saved }) => {
          toast({ title: t(isNew ? 'catalog.created' : 'catalog.saved', { name: saved[`name_${locale}`] }) });
          void navigate('/ops/services');
        },
        onError: (e) =>
          toast({ title: t('catalog.save_failed'), description: t(errorKey(e)), tone: 'error' }),
      },
    );
  };

  const onArchive = () => {
    if (!service.data) return;
    archive.mutate(service.data.id, {
      onSuccess: () => {
        toast({ title: t('catalog.archived', { name: service.data?.[`name_${locale}`] ?? '' }) });
        void navigate('/ops/services');
      },
      onError: (e) =>
        toast({ title: t('catalog.archive_failed'), description: t(errorKey(e)), tone: 'error' }),
    });
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: t('nav.catalog') },
          { label: t('nav.services_pricing'), to: '/ops/services' },
          { label: title },
        ]}
        title={title}
        subtitle={isNew ? t('catalog.new_service_subtitle') : undefined}
      />
      {failed ? (
        <ErrorState
          description={t(errorKey(failed.error))}
          onRetry={() => void failed.refetch()}
          retrying={failed.isFetching}
        />
      ) : pending || !initial || !tenant.data ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      ) : (
        <ServiceForm
          key={service.data?.updated_at ?? 'new'}
          initial={initial}
          categories={categories.data ?? []}
          settings={tenant.data.settings}
          locale={locale}
          isNew={isNew}
          saving={save.isPending}
          archiving={archive.isPending}
          onSubmit={onSubmit}
          onCancel={() => void navigate('/ops/services')}
          onArchive={isNew ? undefined : onArchive}
          onAddCategory={() => setCategoryOpen(true)}
        />
      )}
      <CategoryDialog open={categoryOpen} onOpenChange={setCategoryOpen} />
    </>
  );
}
