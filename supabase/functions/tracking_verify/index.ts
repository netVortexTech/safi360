// POST /functions/v1/tracking_verify — public. Body: { slug, phone, code, ticket_ref? } → { token, booking_id, bookings }
import { handleTrackingVerify } from '../_shared/handlers/tracking.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('tracking_verify', handleTrackingVerify);
