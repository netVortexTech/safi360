// POST /functions/v1/otp_send — public. Body: { slug, phone, purpose: booking|tracking, locale? }
import { handleOtpSend } from '../_shared/handlers/otp.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('otp_send', handleOtpSend);
