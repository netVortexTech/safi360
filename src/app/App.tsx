import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router-dom';
import { ControlLayout } from '@/app/layouts/ControlLayout';
import { FieldLayout } from '@/app/layouts/FieldLayout';
import { OpsLayout } from '@/app/layouts/OpsLayout';
import { PortalLayout } from '@/app/layouts/PortalLayout';
import { AppProviders } from '@/app/providers';
import { RouteError } from '@/app/RouteError';
import { RouteLoading } from '@/app/RouteLoading';
import { NotFoundPage } from '@/app/NotFoundPage';

// Each experience is a lazy chunk so the customer portal and the field PWA never
// download the operations portal.
const PortalHome = lazy(() => import('@/experiences/portal/pages/PortalHome'));
const OpsDashboard = lazy(() => import('@/experiences/ops/pages/OpsDashboard'));
const FieldToday = lazy(() => import('@/experiences/field/pages/FieldToday'));
const ControlHome = lazy(() => import('@/experiences/control/pages/ControlHome'));

const withSuspense = (node: ReactNode) => <Suspense fallback={<RouteLoading />}>{node}</Suspense>;

// Reserved first segments are matched before the tenant slug catch-all.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/ops" replace /> },
  {
    path: '/ops',
    element: <OpsLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: withSuspense(<OpsDashboard />) }],
  },
  {
    path: '/field',
    element: <FieldLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: withSuspense(<FieldToday />) }],
  },
  {
    path: '/control',
    element: <ControlLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: withSuspense(<ControlHome />) }],
  },
  {
    path: '/:slug',
    element: <PortalLayout />,
    errorElement: <RouteError />,
    children: [{ index: true, element: withSuspense(<PortalHome />) }],
  },
  { path: '*', element: <NotFoundPage /> },
];

export function App() {
  return (
    <AppProviders>
      <RouterProvider router={createBrowserRouter(routes)} />
    </AppProviders>
  );
}
