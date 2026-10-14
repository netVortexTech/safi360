// POST /functions/v1/otp_verify — public. Body: { slug, phone, purpose, code } → { token, expires_at }
import { handleOtpVerify } from '../_shared/handlers/otp.ts';
import { serveBooking } from '../_shared/runtime.ts';

serveBooking('otp_verify', handleOtpVerify);
