import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CreditCard,
  FileText,
  LayoutDashboard,
  Plus,
  Repeat,
  Settings,
  Star,
  Tag,
  Ticket,
  Truck,
  UserCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  /** i18n key under `nav.` */
  key: string;
  to: string;
  icon: LucideIcon;
  /** Pending-count badge source, wired in later phases. */
  badge?: 'tickets' | 'exceptions' | 'payments';
}

export interface NavGroup {
  key: string;
  items: NavItem[];
}

/** Ops sidebar groups — order and labels from Stitch "Dashboard — desktop". */
export const OPS_NAV: NavGroup[] = [
  { key: 'overview', items: [{ key: 'dashboard', to: '/ops', icon: LayoutDashboard }] },
  {
    key: 'bookings',
    items: [
      { key: 'tickets', to: '/ops/tickets', icon: Ticket, badge: 'tickets' },
      { key: 'create_booking', to: '/ops/bookings/new', icon: Plus },
      { key: 'calendar', to: '/ops/calendar', icon: Calendar },
      { key: 'dispatch_board', to: '/ops/dispatch', icon: Truck },
      { key: 'exceptions', to: '/ops/exceptions', icon: AlertTriangle, badge: 'exceptions' },
    ],
  },
  { key: 'customers', items: [{ key: 'customers', to: '/ops/customers', icon: Users }] },
  { key: 'catalog', items: [{ key: 'services_pricing', to: '/ops/services', icon: Tag }] },
  { key: 'team', items: [{ key: 'staff', to: '/ops/staff', icon: UserCheck }] },
  {
    key: 'money',
    items: [
      { key: 'payments', to: '/ops/payments', icon: CreditCard, badge: 'payments' },
      { key: 'invoices_balances', to: '/ops/invoices', icon: FileText },
      { key: 'reports', to: '/ops/reports', icon: BarChart3 },
    ],
  },
  {
    key: 'engagement',
    items: [
      { key: 'reviews_complaints', to: '/ops/reviews', icon: Star },
      { key: 'reminders_recurring', to: '/ops/reminders', icon: Repeat },
    ],
  },
  { key: 'settings', items: [{ key: 'settings', to: '/ops/settings', icon: Settings }] },
];

/** Mobile bottom nav — Home · Tickets · Calendar · Customers · More (Stitch "Dashboard — mobile"). */
export const OPS_BOTTOM_NAV: NavItem[] = [
  { key: 'home', to: '/ops', icon: LayoutDashboard },
  { key: 'tickets', to: '/ops/tickets', icon: Ticket, badge: 'tickets' },
  { key: 'calendar', to: '/ops/calendar', icon: Calendar },
  { key: 'customers', to: '/ops/customers', icon: Users },
];
