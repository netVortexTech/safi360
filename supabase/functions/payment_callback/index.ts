// POST /functions/v1/payment_callback — provider webhook; authenticated by the provider signature.
import { handlePaymentCallback } from '../_shared/handlers/payment.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('payment_callback', handlePaymentCallback);
