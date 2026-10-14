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
const PortalServices = lazy(() => import('@/experiences/portal/pages/ServicesPage'));
const PortalServiceDetail = lazy(() => import('@/experiences/portal/pages/ServiceDetailPage'));
const PortalBook = lazy(() => import('@/experiences/portal/pages/BookPage'));
const PortalBookingDone = lazy(() => import('@/experiences/portal/pages/BookingDonePage'));
const PortalTrack = lazy(() => import('@/experiences/portal/pages/TrackPage'));
const PortalTrackBooking = lazy(() => import('@/experiences/portal/pages/TrackBookingPage'));
const OpsDashboard = lazy(() => import('@/experiences/ops/pages/OpsDashboard'));
const OpsLogin = lazy(() => import('@/experiences/ops/pages/OpsLogin'));
const ServicesPage = lazy(() => import('@/experiences/ops/catalog/pages/ServicesPage'));
const ServiceEditorPage = lazy(() => import('@/experiences/ops/catalog/pages/ServiceEditorPage'));
const ServiceAreasPage = lazy(() => import('@/experiences/ops/catalog/pages/ServiceAreasPage'));
const StaffPage = lazy(() => import('@/experiences/ops/team/pages/StaffPage'));
const StaffProfilePage = lazy(() => import('@/experiences/ops/team/pages/StaffProfilePage'));
const FieldToday = lazy(() => import('@/experiences/field/pages/FieldToday'));
const ControlHome = lazy(() => import('@/experiences/control/pages/ControlHome'));

const withSuspense = (node: ReactNode) => <Suspense fallback={<RouteLoading />}>{node}</Suspense>;

// Reserved first segments are matched before the tenant slug catch-all.
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/ops" replace /> },
  { path: '/ops/login', element: withSuspense(<OpsLogin />), errorElement: <RouteError /> },
  {
    path: '/ops',
    element: <OpsLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: withSuspense(<OpsDashboard />) },
      { path: 'services', element: withSuspense(<ServicesPage />) },
      { path: 'services/new', element: withSuspense(<ServiceEditorPage />) },
      { path: 'services/areas', element: withSuspense(<ServiceAreasPage />) },
      { path: 'services/:id', element: withSuspense(<ServiceEditorPage />) },
      { path: 'staff', element: withSuspense(<StaffPage />) },
      { path: 'staff/new', element: withSuspense(<StaffProfilePage />) },
      { path: 'staff/:id', element: withSuspense(<StaffProfilePage />) },
    ],
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
    children: [
      { index: true, element: withSuspense(<PortalHome />) },
      { path: 'services', element: withSuspense(<PortalServices />) },
      { path: 'services/:id', element: withSuspense(<PortalServiceDetail />) },
      { path: 'book', element: withSuspense(<PortalBook />) },
      { path: 'book/done/:ticket', element: withSuspense(<PortalBookingDone />) },
      { path: 'widget', element: withSuspense(<PortalBook />) },
      { path: 'track', element: withSuspense(<PortalTrack />) },
      { path: 'track/recover', element: withSuspense(<PortalTrack />) },
      { path: 'track/:bookingId', element: withSuspense(<PortalTrackBooking />) },
    ],
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
