// Customer data export / anonymisation helpers (data-subject requests).
// Pure + typed, no UI. Works against any Supabase-shaped client exposing
// `.from(table).select(...).eq(...).limit(...)` query chains.
import { maskPhone } from './logger';

const MAX_ROWS = 500;

interface QueryResult {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
}

interface QueryChain {
  eq(column: string, value: string): QueryChain;
  limit(n: number): PromiseLike<QueryResult>;
}

export interface SupabaseLike {
  from(table: string): { select(columns: string): QueryChain };
}

export interface CustomerRecord {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name: string;
  email: string | null;
  locale: string;
  created_at: string;
}

export interface CustomerExport {
  customer: CustomerRecord | null;
  bookings: Record<string, unknown>[];
  payments: Record<string, unknown>[];
}

async function fetchAll(
  client: SupabaseLike,
  table: string,
  columns: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  let query = client.from(table).select(columns);
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }
  const { data, error } = await query.limit(MAX_ROWS);
  if (error) throw new Error(`${table}_fetch_failed: ${error.message}`);
  return data ?? [];
}

function toCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: String(row['id']),
    tenant_id: String(row['tenant_id']),
    phone_e164: String(row['phone_e164']),
    name: String(row['name']),
    email: typeof row['email'] === 'string' ? row['email'] : null,
    locale: String(row['locale']),
    created_at: String(row['created_at']),
  };
}

/**
 * Export every row tied to a phone number within a tenant.
 * Throws Error on any query failure.
 */
export async function exportCustomerData(
  supabaseClient: SupabaseLike,
  tenantId: string,
  phone: string,
): Promise<CustomerExport> {
  const customerRows = await fetchAll(
    supabaseClient,
    'customers',
    'id, tenant_id, phone_e164, name, email, locale, created_at',
    { tenant_id: tenantId, phone_e164: phone },
  );
  const first = customerRows[0];
  if (!first) return { customer: null, bookings: [], payments: [] };
  const customer = toCustomer(first);

  const [bookings, allPayments] = await Promise.all([
    fetchAll(supabaseClient, 'bookings', 'id, ticket_ref, status, total_tzs, scheduled_start, created_at', {
      tenant_id: tenantId,
      customer_id: customer.id,
    }),
    fetchAll(supabaseClient, 'payments', 'id, booking_id, kind, amount_tzs, status, provider, created_at', {
      tenant_id: tenantId,
    }),
  ]);
  // Payments are linked via booking; keep only this customer's bookings.
  const bookingIds = new Set(bookings.map((b) => b['id']));
  return {
    customer,
    bookings,
    payments: allPayments.filter((p) => bookingIds.has(p['booking_id'])),
  };
}

export interface AnonymizedCustomer {
  id: string;
  phone_masked: string;
  name: string;
  email: null;
}

/** Produce a display-safe masked projection of a customer row. */
export function anonymizeCustomer(customer: CustomerRecord): AnonymizedCustomer {
  return {
    id: customer.id,
    phone_masked: maskPhone(customer.phone_e164),
    name: 'Deleted user',
    email: null,
  };
}
