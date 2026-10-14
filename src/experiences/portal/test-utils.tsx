// Render helpers for portal component tests: a catalog from the shared fixtures, the
// portal context, a query client and a memory router.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import {
  FIXTURE_ADDONS,
  FIXTURE_BASE,
  FIXTURE_SERVICES,
  FIXTURE_TENANT_ID,
  FIXTURE_ZONES,
} from '@shared/pricing/fixtures';
import { ToastProvider } from '@/components/ui/toast';
import { PortalContext, type PortalContextValue } from './context';
import type { PortalCatalog } from './types';

export function fixtureCatalog(over: Partial<PortalCatalog> = {}): PortalCatalog {
  return {
    tenant: {
      id: FIXTURE_TENANT_ID,
      slug: 'usafi-bora',
      name: 'Usafi Bora Cleaners',
      city: 'Dar es Salaam',
      phone_e164: '+255754000001',
      ticket_prefix: 'UBC',
      status: 'ACTIVE',
      branding: { display_name: 'Usafi Bora Cleaners', greeting_en: 'Welcome to Usafi Bora!' },
      base: FIXTURE_BASE,
      settings: {
        deposit_pct: 30,
        cancel_hours: 4,
        slot_hold_minutes: 15,
        quote_expiry_hours: 144,
        min_lead_minutes: 120,
        slot_step_min: 60,
        languages: ['sw', 'en'],
        default_locale: 'sw',
        working_hours: {
          mon: { open: '08:00', close: '18:00', closed: false },
          tue: { open: '08:00', close: '18:00', closed: false },
          wed: { open: '08:00', close: '18:00', closed: false },
          thu: { open: '08:00', close: '18:00', closed: false },
          fri: { open: '08:00', close: '18:00', closed: false },
          sat: { open: '08:00', close: '16:00', closed: false },
        },
        tax: { mode: 'none', rate_pct: 18, label: 'VAT' },
      },
    },
    categories: [{ id: 'c-sofa', name_sw: 'Sofa', name_en: 'Sofa & upholstery', sort: 1 }],
    services: FIXTURE_SERVICES.filter((s) => s.active).map((s, i) => ({
      ...s,
      category_id: i === 0 ? 'c-sofa' : null,
      description_sw: null,
      description_en: null,
      recurrence_days: null,
      sort: i,
    })),
    addons: FIXTURE_ADDONS,
    zones: FIXTURE_ZONES,
    ...over,
  };
}

export interface RenderPortalOptions {
  path?: string;
  routes?: RouteObject[];
  context?: Partial<PortalContextValue>;
  queryClient?: QueryClient;
}

export function renderPortal(ui: ReactNode, opts: RenderPortalOptions = {}) {
  const client =
    opts.queryClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const value: PortalContextValue = {
    slug: 'usafi-bora',
    catalog: fixtureCatalog(),
    locale: 'en',
    source: 'website',
    widget: false,
    ...opts.context,
  };
  const routes: RouteObject[] = opts.routes ?? [{ path: '/:slug/*', element: ui }];
  const router = createMemoryRouter(routes, { initialEntries: [opts.path ?? '/usafi-bora'] });
  const result = render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <PortalContext.Provider value={value}>
          <RouterProvider router={router} />
        </PortalContext.Provider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { ...result, router, client };
}
