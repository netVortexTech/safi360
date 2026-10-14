// Public quote handler: slug → tenant → rate limit → fresh catalog → pure quote().
// The catalog is read on every request (no cache), so a price edited in the ops portal
// is what the next customer sees.
import { quote } from '../pricing/quote.ts';
import type { PricingContext, QuoteResult } from '../pricing/types.ts';
import { quoteRequest, tenantSettings, type TenantSettings } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import type { HandlerResult, PublicDeps, PublicTenantInfo } from './types.ts';

export interface QuoteResponse {
  tenant: { slug: string; name: string };
  quote: QuoteResult;
}

export function settingsOf(tenant: PublicTenantInfo): TenantSettings {
  const parsed = tenantSettings.safeParse(tenant.settings ?? {});
  if (!parsed.success) throw new Error('tenant_settings_invalid');
  return parsed.data;
}

export function pricingContext(
  tenant: PublicTenantInfo,
  settings: TenantSettings,
  now: Date,
): PricingContext {
  return {
    deposit_pct: settings.deposit_pct,
    quote_expiry_hours: settings.quote_expiry_hours,
    tax: settings.tax,
    base:
      tenant.base_lat != null && tenant.base_lng != null
        ? { lat: tenant.base_lat, lng: tenant.base_lng }
        : null,
    now,
  };
}

export async function handleQuote(rawBody: unknown, deps: PublicDeps): Promise<HandlerResult> {
  try {
    const input = quoteRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'quote');
    const settings = settingsOf(tenant);
    const catalog = await deps.loadCatalog(tenant.id);
    const result = quote(
      { items: input.items, address: input.address ?? null },
      catalog,
      pricingContext(tenant, settings, deps.now()),
    );
    const body: QuoteResponse = { tenant: { slug: tenant.slug, name: tenant.name }, quote: result };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
