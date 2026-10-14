import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/shared/Field';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { PaymentStatus } from '@/components/shared/PaymentStatus';
import { usePaymentsLedger, useRecordManualPayment } from './hooks';
import type { PaymentLedgerRow } from './hooks';

export default function PaymentsPage() {
  const auth = useAuth();
  const role = auth.claims.tenant_role;
  const canView = can(role, 'payment.view');
  const canManual = can(role, 'payment.record_manual');
  const ledger = usePaymentsLedger();
  const recordManual = useRecordManualPayment();
  const [providerFilter, setProviderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [selected, setSelected] = useState<PaymentLedgerRow | null>(null);

  const rows = useMemo(() => ledger.data ?? [], [ledger.data]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (providerFilter && row.provider !== providerFilter) return false;
      if (statusFilter && row.status !== statusFilter) return false;
      if (needle && !`${row.booking_ticket_ref} ${row.customer_name} ${row.provider_ref ?? ''}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, providerFilter, search, statusFilter]);

  const collected = rows.filter((r) => r.status === 'SUCCESS').reduce((sum, r) => sum + r.amount_tzs, 0);
  const pending = rows.filter((r) => r.status === 'PENDING').reduce((sum, r) => sum + r.amount_tzs, 0);
  const failed = rows.filter((r) => r.status === 'FAILED').length;

  if (!canView) {
    return <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">Payment ledger is management only.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Ledger, reconciliation and receipts" />
      <div className="grid gap-3 md:grid-cols-4">
        <Card><CardBody><p className="text-caption text-text-subtle">Collected</p><p className="mt-1 text-h2 tabular">{formatTzs(collected)}</p></CardBody></Card>
        <Card><CardBody><p className="text-caption text-text-subtle">Pending</p><p className="mt-1 text-h2 tabular">{formatTzs(pending)}</p></CardBody></Card>
        <Card><CardBody><p className="text-caption text-text-subtle">Failed attempts</p><p className="mt-1 text-h2 tabular">{failed}</p></CardBody></Card>
        <Card><CardBody><p className="text-caption text-text-subtle">Rows</p><p className="mt-1 text-h2 tabular">{rows.length}</p></CardBody></Card>
      </div>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input placeholder="Search ticket, customer or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}>
              <option value="">All providers</option>
              <option value="MOCK">Mock</option>
              <option value="SELCOM">Selcom</option>
              <option value="AZAMPAY">AzamPay</option>
              <option value="MANUAL">Manual</option>
            </Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN', 'REFUNDED'].map((status) => <option key={status} value={status}>{status}</option>)}
            </Select>
            {canManual ? <Button onClick={() => setManualOpen(true)}>Record manual payment</Button> : null}
          </div>
          {ledger.isLoading ? <div className="h-40 animate-pulse rounded bg-surface-muted" /> : null}
          {ledger.error ? <p className="text-error">{String(ledger.error)}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-text-subtle">
                  <th className="py-2">Ticket</th>
                  <th className="py-2">Customer</th>
                  <th className="py-2">Provider</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2 font-medium">{row.booking_ticket_ref}</td>
                    <td className="py-2">{row.customer_name || '-'}</td>
                    <td className="py-2">{row.provider}</td>
                    <td className="py-2 tabular">{formatTzs(row.amount_tzs)}</td>
                    <td className="py-2"><PaymentStatus status={row.status} /></td>
                    <td className="py-2 text-xs text-text-subtle">{formatDay(row.created_at, 'en')}</td>
                    <td className="py-2"><Button variant="ghost" size="sm" onClick={() => setSelected(row)}>Detail</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {selected ? (
        <div className="fixed inset-0 z-50 bg-black/50 p-4" onClick={() => setSelected(null)}>
          <div className="mx-auto mt-10 max-w-lg rounded-xl bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-h2">Payment detail</h2>
            <p className="mt-2 text-sm">Reference: {selected.provider_ref ?? '-'}</p>
            <p className="mt-1 text-sm">Status: {selected.status}</p>
            <p className="mt-1 text-sm">Amount: {formatTzs(selected.amount_tzs)}</p>
            <p className="mt-1 text-sm">Raw: {JSON.stringify(selected.raw)}</p>
            <Button className="mt-4" onClick={() => setSelected(null)}>Close</Button>
          </div>
        </div>
      ) : null}

      {manualOpen ? (
        <ManualPaymentDialog
          busy={recordManual.isPending}
          error={recordManual.error ? String(recordManual.error) : null}
          onClose={() => setManualOpen(false)}
          onSubmit={(vars) => {
            void recordManual.mutateAsync(vars).then(() => setManualOpen(false));
          }}
        />
      ) : null}
    </div>
  );
}

function ManualPaymentDialog({ busy, error, onClose, onSubmit }: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (vars: { booking_id: string; amount_tzs: number; method: string; reason: string }) => void;
}) {
  const [bookingId, setBookingId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-5">
        <h2 className="text-h2">Record manual payment</h2>
        <p className="mt-1 text-sm text-text-muted">Emergency use only: creates a MANUAL payment and updates the ledger.</p>
        {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
        <div className="mt-4 space-y-3">
          <Field id="manual-booking" label="Booking ID" required><Input id="manual-booking" value={bookingId} onChange={(e) => setBookingId(e.target.value)} /></Field>
          <Field id="manual-amount" label="Amount TZS" required><Input id="manual-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field id="manual-method" label="Method"><Select id="manual-method" value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile money</option></Select></Field>
          <Field id="manual-reason" label="Reason" required><Input id="manual-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !bookingId || !amount || !reason} loading={busy} onClick={() => onSubmit({ booking_id: bookingId, amount_tzs: Number(amount), method, reason })}>Save</Button>
        </div>
      </div>
    </div>
  );
}
