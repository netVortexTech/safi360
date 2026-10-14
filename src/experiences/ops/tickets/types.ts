import type { BookingFlag, BookingSource, BookingStatus, PaymentStatus } from '@shared/enums';
export type { BookingFlag } from '@shared/enums';

/** A booking row joined with customer + quote data for list/detail views. */
export interface TicketRow {
  id: string;
  tenant_id: string;
  ticket_ref: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  status: BookingStatus;
  source: BookingSource;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_min: number;
  crew_size: number;
  flags: BookingFlag[];
  total_tzs: number;
  deposit_tzs: number;
  paid_tzs: number;
  payment_mode: 'DEPOSIT' | 'ON_COMPLETION';
  notes_customer: string | null;
  notes_internal: string | null;
  address_snapshot: Record<string, unknown>;
  zone_id: string | null;
  locale: 'sw' | 'en';
  hold_expires_at: string | null;
  confirmed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  quote_id: string | null;
  quote_status: string | null;
  quote_total_tzs: number | null;
  services: string[]; // service names
  assignee_names: string[];
}

export interface TicketFilters {
  search: string;
  source: BookingSource | '';
  status: BookingStatus | '';
  date_from: string;
  date_to: string;
  service_id: string;
  team_id: string;
  payment_status: PaymentStatus | '';
}

export const emptyTicketFilters: TicketFilters = {
  search: '',
  source: '',
  status: '',
  date_from: '',
  date_to: '',
  service_id: '',
  team_id: '',
  payment_status: '',
};

export interface SavedView {
  id: string;
  name: string;
  filters: TicketFilters;
  created_at: string;
}

/** KPI cards for the dashboard. */
export interface DashboardKpis {
  todays_jobs: number;
  needs_action: number;
  booked_value_tzs: number;
  collected_tzs: number;
  pending_tzs: number;
  open_exceptions: number;
}

export interface NeedsActionItem {
  booking_id: string;
  ticket_ref: string;
  customer_name: string;
  status: BookingStatus;
  reason: string;
  priority: 'high' | 'normal' | 'low';
  created_at: string;
}

export interface BookingBySource {
  source: BookingSource;
  count: number;
}

export interface ExceptionRow {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  ticket_ref: string | null;
  customer_name: string | null;
  kind: string;
  severity: 'low' | 'normal' | 'high';
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  details: Record<string, unknown>;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  booking_id: string;
  ticket_ref: string;
  customer_name: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  crew_size: number;
  services: string[];
  address_snapshot: Record<string, unknown>;
  assignees: { staff_id: string; name: string; is_lead: boolean }[];
  color: string;
}

export interface DispatchItem {
  booking_id: string;
  ticket_ref: string;
  customer_name: string;
  status: BookingStatus;
  scheduled_start: string;
  scheduled_end: string;
  crew_size: number;
  assignee_ids: string[];
  address_snapshot: Record<string, unknown>;
  source: BookingSource;
}

export interface AssignmentCandidate {
  staff_id: string;
  name: string;
  skills: string[];
  current_load: number;
  distance_km: number | null;
  available: boolean;
  conflict_reason: string | null;
}

export interface CustomerRow {
  id: string;
  tenant_id: string;
  phone_e164: string;
  name: string;
  email: string | null;
  locale: 'sw' | 'en';
  phone_verified_at: string | null;
  notes_internal: string | null;
  first_source: BookingSource;
  tags: string[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  booking_count: number;
  total_booked_tzs: number;
  total_paid_tzs: number;
  last_booking_at: string | null;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  region: string | null;
  district: string | null;
  ward: string | null;
  street: string | null;
  landmark: string | null;
  area: string | null;
  lat: number | null;
  lng: number | null;
  zone_id: string | null;
  is_default: boolean;
}

export interface CustomerDuplicate {
  id: string;
  customer_id: string;
  duplicate_of_id: string;
  reason: string;
  status: 'OPEN' | 'MERGED' | 'DISMISSED';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  // joined
  customer_name: string;
  customer_phone: string;
  other_name: string;
  other_phone: string;
}

export interface JobEventRow {
  id: number;
  booking_id: string;
  kind: string;
  from_status: BookingStatus | null;
  to_status: BookingStatus | null;
  actor_kind: 'customer' | 'staff' | 'system';
  actor_label: string | null;
  customer_visible: boolean;
  message_key: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  ticket_ref: string;
  kind: 'DEPOSIT' | 'BALANCE';
  provider: string;
  provider_ref: string | null;
  amount_tzs: number;
  status: PaymentStatus;
  created_at: string;
  completed_at: string | null;
}

export interface QuoteRow {
  id: string;
  booking_id: string;
  status: string;
  total_tzs: number;
  deposit_tzs: number;
  requires_review: boolean;
  has_estimate: boolean;
  revised_from_id: string | null;
  expires_at: string | null;
  sent_at: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: number;
  tenant_id: string;
  actor_user_id: string | null;
  actor_role: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  diff: Record<string, unknown>;
  created_at: string;
}
