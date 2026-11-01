// POST /functions/v1/customer_auth — public. Body: { action: signup|login, slug, phone, password, … }
// Client accounts while SMS codes are unavailable (Briq sender ID pending).
import { handleCustomerAuth } from '../_shared/handlers/customer-auth.ts';
import { serveCustomerAuth } from '../_shared/runtime.ts';

serveCustomerAuth('customer_auth', handleCustomerAuth);
