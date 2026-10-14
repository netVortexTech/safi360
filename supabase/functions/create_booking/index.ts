// POST /functions/v1/create_booking — public; requires a booking verify token.
// Body: { slug, idempotency_key, verify_token, customer, address?, items, slot?, payment_mode?, source?, locale?, notes?, expected_total_tzs? }
import { handleCreateBooking } from '../_shared/handlers/create-booking.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('create_booking', handleCreateBooking);
