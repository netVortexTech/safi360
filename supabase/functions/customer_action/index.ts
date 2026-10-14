// POST /functions/v1/customer_action — public with a verified token.
// Body: { slug, token, booking_id, action: approve_quote|reject_quote|cancel|request_reschedule, reason?, preferred_start?, note? }
import { handleCustomerAction } from '../_shared/handlers/customer-action.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('customer_action', handleCustomerAction);
