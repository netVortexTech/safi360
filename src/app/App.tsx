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
const TicketsPage = lazy(() => import('@/experiences/ops/tickets/TicketsPage'));
const TicketDetailPage = lazy(() => import('@/experiences/ops/tickets/TicketDetailPage'));
const CreateBookingPage = lazy(() => import('@/experiences/ops/tickets/CreateBookingPage'));
const CustomersPage = lazy(() => import('@/experiences/ops/customers/CustomersPage'));
const CustomerProfilePage = lazy(() => import('@/experiences/ops/customers/CustomerProfilePage'));
const CalendarPage = lazy(() => import('@/experiences/ops/calendar/CalendarPage'));
const DispatchPage = lazy(() => import('@/experiences/ops/dispatch/DispatchPage'));
const ExceptionsPage = lazy(() => import('@/experiences/ops/exceptions/ExceptionsPage'));
const PaymentsPage = lazy(() => import('@/experiences/ops/payments/PaymentsPage'));
const FieldToday = lazy(() => import('@/experiences/field/pages/FieldToday'));
const FieldLogin = lazy(() => import('@/experiences/field/pages/FieldLogin'));
const FieldUpcoming = lazy(() => import('@/experiences/field/pages/FieldUpcoming'));
const FieldHistory = lazy(() => import('@/experiences/field/pages/FieldHistory'));
const FieldAlerts = lazy(() => import('@/experiences/field/pages/FieldAlerts'));
const JobDetail = lazy(() => import('@/experiences/field/pages/JobDetail'));
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
      { path: 'tickets', element: withSuspense(<TicketsPage />) },
      { path: 'tickets/:id', element: withSuspense(<TicketDetailPage />) },
      { path: 'bookings/new', element: withSuspense(<CreateBookingPage />) },
      { path: 'customers', element: withSuspense(<CustomersPage />) },
      { path: 'customers/:id', element: withSuspense(<CustomerProfilePage />) },
      { path: 'calendar', element: withSuspense(<CalendarPage />) },
      { path: 'dispatch', element: withSuspense(<DispatchPage />) },
      { path: 'exceptions', element: withSuspense(<ExceptionsPage />) },
      { path: 'payments', element: withSuspense(<PaymentsPage />) },
      { path: 'invoices', element: withSuspense(<PaymentsPage />) },
    ],
  },
  { path: '/field/login', element: withSuspense(<FieldLogin />), errorElement: <RouteError /> },
  {
    path: '/field',
    element: <FieldLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: withSuspense(<FieldToday />) },
      { path: 'jobs/:id', element: withSuspense(<JobDetail />) },
      { path: 'upcoming', element: withSuspense(<FieldUpcoming />) },
      { path: 'history', element: withSuspense(<FieldHistory />) },
      { path: 'alerts', element: withSuspense(<FieldAlerts />) },
    ],
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
