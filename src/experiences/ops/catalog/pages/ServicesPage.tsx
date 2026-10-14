import { Plus, SlidersHorizontal, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { DataView, type DataColumn } from '@/components/shared/DataView';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { errorKey } from '@/lib/errors';
import { formatTzs } from '@/lib/money';
import { CatalogTabs } from '../CatalogTabs';
import { useCategories, useServices } from '../hooks';
import { startingPrice } from '../pricing-labels';
import { PricingTypeChip } from '../PricingTypeChip';
import type { ServiceRow } from '../types';

type StatusFilter = 'all' | 'active' | 'inactive';

interface Filters {
  q: string;
  category: string;
  status: StatusFilter;
}

const DEFAULT_FILTERS: Filters = { q: '', category: '', status: 'all' };

export default function ServicesPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'sw' ? 'sw' : 'en';
  const navigate = useNavigate();
  const services = useServices();
  const categories = useCategories();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const categoryName = (id: string | null) => {
    const c = categories.data?.find((x) => x.id === id);
    return c ? c[`name_${locale}`] : t('catalog.field.no_category');
  };

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return (services.data ?? []).filter((s) => {
      if (filters.category && s.category_id !== filters.category) return false;
      if (filters.status === 'active' && !s.active) return false;
      if (filters.status === 'inactive' && s.active) return false;
      if (q && !`${s.name_en} ${s.name_sw}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [services.data, filters]);

  const activeFilterCount = [filters.q, filters.category, filters.status !== 'all' ? 'x' : ''].filter(
    Boolean,
  ).length;

  const priceCell = (s: ServiceRow) => {
    const p = startingPrice(s.pricing_type, s.pricing_rule);
    if (!p) return <span className="text-text-subtle">{t('catalog.price_on_review')}</span>;
    const amount = formatTzs(p.amount_tzs);
    const per = p.per ? ` / ${p.per[locale]}` : '';
    return (
      <span className="tabular">
        {p.from ? t('catalog.from_price', { price: `${amount}${per}` }) : `${amount}${per}`}
      </span>
    );
  };

  const columns: DataColumn<ServiceRow>[] = [
    {
      key: 'name',
      header: t('catalog.col.service'),
      cell: (s) => (
        <div>
          <div className="font-medium text-text">{s[`name_${locale}`]}</div>
          <div className="text-xs text-text-subtle">{s[locale === 'sw' ? 'name_en' : 'name_sw']}</div>
        </div>
      ),
    },
    { key: 'category', header: t('catalog.col.category'), cell: (s) => categoryName(s.category_id) },
    {
      key: 'pricing',
      header: t('catalog.col.pricing'),
      cell: (s) => <PricingTypeChip type={s.pricing_type} />,
    },
    { key: 'price', header: t('catalog.col.price'), cell: priceCell, align: 'right' },
    { key: 'crew', header: t('catalog.col.crew'), cell: (s) => s.crew_size, align: 'right' },
    {
      key: 'status',
      header: t('catalog.col.status'),
      cell: (s) => (
        <Badge tone={s.active ? 'success' : 'neutral'}>
          {t(s.active ? 'common.active' : 'common.inactive')}
        </Badge>
      ),
    },
  ];

  const state = services.isPending
    ? 'loading'
    : services.isError
      ? 'error'
      : filtered.length === 0
        ? 'empty'
        : 'data';
  const noneAtAll = (services.data?.length ?? 0) === 0;

  const filterControls = (
    <>
      <Field id="svc-q" label={t('common.search')}>
        <Input
          id="svc-q"
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder={t('catalog.search_placeholder')}
        />
      </Field>
      <Field id="svc-category" label={t('catalog.col.category')}>
        <Select
          id="svc-category"
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
        >
          <option value="">{t('common.all')}</option>
          {(categories.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c[`name_${locale}`]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="svc-status" label={t('catalog.col.status')}>
        <Select
          id="svc-status"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as StatusFilter })}
        >
          <option value="all">{t('common.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
        </Select>
      </Field>
    </>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: t('nav.catalog') }, { label: t('nav.services_pricing') }]}
        title={t('nav.services_pricing')}
        subtitle={t('catalog.services_subtitle')}
        actions={
          <Button asChild>
            <Link to="/ops/services/new">
              <Plus aria-hidden="true" />
              {t('catalog.add_service')}
            </Link>
          </Button>
        }
      />
      <CatalogTabs />

      <div className="mb-4 hidden grid-cols-3 gap-3 md:grid">{filterControls}</div>
      <div className="mb-4 flex items-center gap-2 md:hidden">
        <Input
          type="search"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder={t('catalog.search_placeholder')}
          aria-label={t('common.search')}
        />
        <Button variant="secondary" onClick={() => setSheetOpen(true)} aria-label={t('common.filters')}>
          <SlidersHorizontal aria-hidden="true" />
          {activeFilterCount > 0 ? activeFilterCount : null}
        </Button>
      </div>
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>{t('common.filters')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">{filterControls}</div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
              {t('common.clear')}
            </Button>
            <Button onClick={() => setSheetOpen(false)}>{t('common.apply')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DataView
        state={state}
        rows={filtered}
        columns={columns}
        rowKey={(s) => s.id}
        caption={t('nav.services_pricing')}
        onRowClick={(s) => void navigate(`/ops/services/${s.id}`)}
        renderCard={(s) => (
          <Link
            to={`/ops/services/${s.id}`}
            className="block rounded-lg border border-border bg-surface p-4 shadow-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-text">{s[`name_${locale}`]}</div>
                <div className="text-xs text-text-subtle">{categoryName(s.category_id)}</div>
              </div>
              <Badge tone={s.active ? 'success' : 'neutral'}>
                {t(s.active ? 'common.active' : 'common.inactive')}
              </Badge>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm">
              <PricingTypeChip type={s.pricing_type} />
              {priceCell(s)}
            </div>
          </Link>
        )}
        empty={
          noneAtAll ? (
            <EmptyState
              icon={<Tag />}
              title={t('catalog.empty_title')}
              description={t('catalog.empty_body')}
              actions={
                <Button asChild>
                  <Link to="/ops/services/new">
                    <Plus aria-hidden="true" />
                    {t('catalog.add_service')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              title={t('catalog.no_match_title')}
              description={t('catalog.no_match_body')}
              actions={
                <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  {t('common.clear_filters')}
                </Button>
              }
            />
          )
        }
        error={
          <ErrorState
            description={t(errorKey(services.error))}
            onRetry={() => void services.refetch()}
            retrying={services.isFetching}
          />
        }
      />
    </>
  );
}
