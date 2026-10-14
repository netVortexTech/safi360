// POST /functions/v1/tracking_start — public. Body: { slug, phone, ticket_ref?, locale? } → always { status: 'code_sent' }
import { handleTrackingStart } from '../_shared/handlers/tracking.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('tracking_start', handleTrackingStart);
