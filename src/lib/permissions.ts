import type { MemberRole } from '@shared/enums';

// Small permission map in code (blueprint §2.1): no generic RBAC tables at MVP.
// The database enforces the same rules in RLS; this map only decides what the UI offers.
export type Permission =
  | 'booking.view'
  | 'booking.create'
  | 'booking.review'
  | 'booking.assign'
  | 'booking.cancel'
  | 'booking.reschedule'
  | 'customer.view'
  | 'customer.edit'
  | 'customer.merge'
  | 'catalog.edit'
  | 'staff.manage'
  | 'payment.view'
  | 'payment.record_manual'
  | 'payment.refund'
  | 'report.view'
  | 'report.export'
  | 'settings.edit'
  | 'integration.manage'
  | 'billing.manage'
  | 'field.execute';

const ALL: MemberRole[] = ['OWNER', 'MANAGER', 'DISPATCHER', 'CLEANER'];
const OFFICE: MemberRole[] = ['OWNER', 'MANAGER', 'DISPATCHER'];
const MANAGEMENT: MemberRole[] = ['OWNER', 'MANAGER'];
const OWNER_ONLY: MemberRole[] = ['OWNER'];

const matrix: Record<Permission, readonly MemberRole[]> = {
  'booking.view': ALL, // cleaners see only their own assignments (RLS)
  'booking.create': OFFICE,
  'booking.review': OFFICE,
  'booking.assign': OFFICE,
  'booking.cancel': OFFICE,
  'booking.reschedule': OFFICE,
  'customer.view': OFFICE,
  'customer.edit': OFFICE,
  'customer.merge': MANAGEMENT,
  'catalog.edit': MANAGEMENT,
  'staff.manage': MANAGEMENT,
  'payment.view': OFFICE,
  'payment.record_manual': MANAGEMENT,
  'payment.refund': OWNER_ONLY,
  'report.view': MANAGEMENT,
  'report.export': OWNER_ONLY,
  'settings.edit': OWNER_ONLY,
  'integration.manage': OWNER_ONLY,
  'billing.manage': OWNER_ONLY,
  'field.execute': ['CLEANER'],
};

export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return matrix[permission].includes(role);
}
