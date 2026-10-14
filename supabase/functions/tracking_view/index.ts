// POST /functions/v1/tracking_view — public with a verified token. Body: { slug, token, booking_id }
import { handleTrackingView } from '../_shared/handlers/tracking.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('tracking_view', handleTrackingView);
