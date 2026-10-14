// POST /functions/v1/payment_start — public with a verified token. Body: { slug, token, booking_id, kind, idempotency_key }
import { handlePaymentStart } from '../_shared/handlers/payment.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('payment_start', handlePaymentStart);
