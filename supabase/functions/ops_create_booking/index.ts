// POST /functions/v1/ops_create_booking — staff-created booking (ops app, repeat flow).
// Body: { customer, items, quote, schedule?, payment_mode, ... }; staff identity
// comes from the request JWT (tenant_id/tenant_role claims).
import { handleOpsCreateBooking } from '../_shared/handlers/ops-create-booking.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('ops_create_booking', handleOpsCreateBooking);
