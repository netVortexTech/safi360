import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/shared/Field';

/**
 * Record an offline receipt (cash / bank / mobile money). When opened from a
 * ticket or invoice the booking is preset and locked; the ledger keeps the
 * free-typed form for matching stray receipts.
 */
export function ManualPaymentDialog({
  busy,
  error,
  bookingId: presetBookingId,
  bookingLabel,
  suggestedAmount,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  error: string | null;
  bookingId?: string;
  bookingLabel?: string;
  suggestedAmount?: number;
  onClose: () => void;
  onSubmit: (vars: { booking_id: string; amount_tzs: number; method: string; reason: string }) => void;
}) {
  const { t } = useTranslation();
  const locked = presetBookingId != null;
  const [bookingId, setBookingId] = useState(presetBookingId ?? '');
  const [amount, setAmount] = useState(
    suggestedAmount != null && suggestedAmount > 0 ? String(suggestedAmount) : '',
  );
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-5">
        <h2 className="text-h2">{t('ops.record_payment')}</h2>
        <p className="mt-1 text-sm text-text-muted">{t('ops.record_payment_body')}</p>
        {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
        <div className="mt-4 space-y-3">
          <Field id="manual-booking" label={t('ops.manual_booking')} required>
            {locked ? (
              <Input id="manual-booking" value={bookingLabel ?? bookingId} disabled />
            ) : (
              <Input id="manual-booking" value={bookingId} onChange={(e) => setBookingId(e.target.value)} />
            )}
          </Field>
          <Field
            id="manual-amount"
            label={t('ops.manual_amount')}
            required
            error={amount !== '' && !(Number(amount) > 0) ? t('validation.money.positive') : undefined}
          >
            <Input
              id="manual-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              invalid={amount !== '' && !(Number(amount) > 0)}
              aria-describedby={amount !== '' && !(Number(amount) > 0) ? 'manual-amount-error' : undefined}
            />
          </Field>
          <Field id="manual-method" label={t('ops.manual_method')}>
            <Select id="manual-method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">{t('ops.pay_method_cash')}</option>
              <option value="bank">{t('ops.pay_method_bank')}</option>
              <option value="mobile_money">{t('ops.pay_method_mobile')}</option>
            </Select>
          </Field>
          <Field id="manual-reason" label={t('ops.manual_reason')} required>
            <Input id="manual-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={busy || !bookingId || !(Number(amount) > 0) || !reason}
            loading={busy}
            onClick={() => onSubmit({ booking_id: bookingId, amount_tzs: Number(amount), method, reason })}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
