import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const reportKeys = {
  all: ['reports'] as const,
  detail: (from: string, to: string) => ['reports', 'detail', from, to] as const,
};

export interface ReportData {
  kpis: {
    received: number;
    confirmed: number;
    cancelled: number;
    completed: number;
  };
  revenue: {
    booked_tzs: number;
    invoiced_tzs: number;
    collected_tzs: number;
  };
  by_service: { service: string; count: number }[];
  by_source: { source: string; count: number }[];
  by_cleaner: {
    cleaner: string;
    jobs: number;
    completion_rate: number;
    avg_rating: number;
  }[];
  unpaid: {
    customer: string;
    ticket: string;
    amount_tzs: number;
    days_outstanding: number;
  }[];
  repeat_customers: {
    customer: string;
    bookings: number;
    total_spent_tzs: number;
    last_booking: string;
  }[];
  cancellation: {
    rate: number;
    trend: 'up' | 'down' | 'stable';
  };
  confirmation: {
    avg_hours: number;
  };
}

export function useReports(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: reportKeys.detail(dateFrom, dateTo),
    queryFn: async (): Promise<ReportData> => {
      const from = dateFrom || '1970-01-01';
      const to = dateTo ? `${dateTo}T23:59:59.999Z` : new Date().toISOString();

      const { data, error } = await supabase
        .from('bookings')
        .select(
          `
          id, ticket_ref, status, source, total_tzs, paid_tzs,
          scheduled_start, confirmed_at, created_at, completed_at, cancelled_at,
          customer:customers!inner(name),
          items:booking_items(label_en, label_sw),
          assignments(id, staff_id, staff:staff(display_name))
        `,
        )
        .gte('created_at', from)
        .lte('created_at', to)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const rows = (data ?? []) as Record<string, unknown>[];
      const customer = (r: Record<string, unknown>) =>
        (r.customer as { name: string })?.name ?? '';
      const itemLabels = (r: Record<string, unknown>) =>
        ((r.items as Record<string, unknown>[]) ?? []).map(
          (i) => (i.label_en as string) || (i.label_sw as string),
        );
      const staffNames = (r: Record<string, unknown>) =>
        ((r.assignments as Record<string, unknown>[]) ?? []).map(
          (a) => (a.staff as { display_name: string })?.display_name ?? '',
        );

      const total = rows.length;
      const confirmed = rows.filter((r) => r.status === 'CONFIRMED').length;
      const cancelled = rows.filter((r) => r.status === 'CANCELLED').length;
      const completed = rows.filter((r) => r.status === 'COMPLETED').length;

      const bookedTzs = rows.reduce((s, r) => s + ((r.total_tzs as number) ?? 0), 0);
      const collectedTzs = rows.reduce((s, r) => s + ((r.paid_tzs as number) ?? 0), 0);

      // By service
      const serviceMap = new Map<string, number>();
      for (const r of rows) {
        for (const label of itemLabels(r)) {
          serviceMap.set(label, (serviceMap.get(label) ?? 0) + 1);
        }
      }
      const by_service = Array.from(serviceMap.entries())
        .map(([service, count]) => ({ service, count }))
        .sort((a, b) => b.count - a.count);

      // By source
      const sourceMap = new Map<string, number>();
      for (const r of rows) {
        const src = r.source as string;
        sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
      }
      const by_source = Array.from(sourceMap.entries())
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);

      // By cleaner
      const cleanerMap = new Map<string, { jobs: number; completed: number; ratings: number[] }>();
      for (const r of rows) {
        const names = staffNames(r);
        const name = names[0];
        if (!name) continue;
        const entry = cleanerMap.get(name) ?? { jobs: 0, completed: 0, ratings: [] };
        entry.jobs++;
        if (r.status === 'COMPLETED') entry.completed++;
        cleanerMap.set(name, entry);
      }
      const by_cleaner = Array.from(cleanerMap.entries())
        .map(([cleaner, d]) => ({
          cleaner,
          jobs: d.jobs,
          completion_rate: d.jobs > 0 ? Math.round((d.completed / d.jobs) * 100) : 0,
          avg_rating: 0,
        }))
        .sort((a, b) => b.jobs - a.jobs);

      // Unpaid
      const now = Date.now();
      const unpaid = rows
        .filter((r) => {
          const total = (r.total_tzs as number) ?? 0;
          const paid = (r.paid_tzs as number) ?? 0;
          return total > paid && r.status !== 'CANCELLED';
        })
        .map((r) => {
          const created = new Date(r.created_at as string).getTime();
          const days = Math.max(0, Math.floor((now - created) / (1000 * 60 * 60 * 24)));
          return {
            customer: customer(r),
            ticket: r.ticket_ref as string,
            amount_tzs: ((r.total_tzs as number) ?? 0) - ((r.paid_tzs as number) ?? 0),
            days_outstanding: days,
          };
        })
        .sort((a, b) => b.days_outstanding - a.days_outstanding);

      // Repeat customers
      const custMap = new Map<string, { count: number; spent: number; last: string }>();
      for (const r of rows) {
        const name = customer(r);
        if (!name) continue;
        const entry = custMap.get(name) ?? { count: 0, spent: 0, last: r.created_at as string };
        entry.count++;
        entry.spent += (r.total_tzs as number) ?? 0;
        if ((r.created_at as string) > entry.last) entry.last = r.created_at as string;
        custMap.set(name, entry);
      }
      const repeat_customers = Array.from(custMap.entries())
        .filter(([, d]) => d.count > 1)
        .map(([customerName, d]) => ({
          customer: customerName,
          bookings: d.count,
          total_spent_tzs: d.spent,
          last_booking: d.last,
        }))
        .sort((a, b) => b.bookings - a.bookings);

      // Cancellation rate
      const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

      // Avg confirmation time
      const confirmedRows = rows.filter((r) => r.confirmed_at && r.created_at);
      const totalHours = confirmedRows.reduce((s, r) => {
        const diff = new Date(r.confirmed_at as string).getTime() - new Date(r.created_at as string).getTime();
        return s + diff / (1000 * 60 * 60);
      }, 0);
      const avgHours = confirmedRows.length > 0
        ? Math.round((totalHours / confirmedRows.length) * 10) / 10
        : 0;

      return {
        kpis: { received: total, confirmed, cancelled, completed },
        revenue: { booked_tzs: bookedTzs, invoiced_tzs: bookedTzs, collected_tzs: collectedTzs },
        by_service,
        by_source,
        by_cleaner,
        unpaid,
        repeat_customers,
        cancellation: { rate: cancellationRate, trend: 'stable' },
        confirmation: { avg_hours: avgHours },
      };
    },
    staleTime: 30_000,
  });
}

export function exportCsv(data: ReportData, dateFrom: string, dateTo: string) {
  const lines: string[] = [];
  lines.push('Report');
  lines.push(`Date range,${dateFrom} to ${dateTo}`);
  lines.push('');
  lines.push('KPIs');
  lines.push(`Received,${data.kpis.received}`);
  lines.push(`Confirmed,${data.kpis.confirmed}`);
  lines.push(`Cancelled,${data.kpis.cancelled}`);
  lines.push(`Completed,${data.kpis.completed}`);
  lines.push('');
  lines.push('Revenue');
  lines.push(`Booked (TZS),${data.revenue.booked_tzs}`);
  lines.push(`Invoiced (TZS),${data.revenue.invoiced_tzs}`);
  lines.push(`Collected (TZS),${data.revenue.collected_tzs}`);
  lines.push('');
  lines.push('Performance by Service');
  lines.push('Service,Bookings');
  for (const s of data.by_service) lines.push(`${s.service},${s.count}`);
  lines.push('');
  lines.push('Performance by Source');
  lines.push('Source,Bookings');
  for (const s of data.by_source) lines.push(`${s.source},${s.count}`);
  lines.push('');
  lines.push('Unpaid Jobs');
  lines.push('Customer,Ticket,Amount (TZS),Days Outstanding');
  for (const u of data.unpaid) lines.push(`${u.customer},${u.ticket},${u.amount_tzs},${u.days_outstanding}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `report-${dateFrom}-${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
