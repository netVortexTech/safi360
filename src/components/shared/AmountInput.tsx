import { forwardRef, useId, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { parseTzs } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface AmountInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type'
> {
  label?: string;
  /** Integer TZS or null when empty/invalid. */
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string | undefined;
  hint?: string | undefined;
}

function display(value: number | null): string {
  return value == null ? '' : value.toLocaleString('en-US');
}

/** TZS prefix, grouped digits as you type, integer-only. */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ label, value, onChange, error, hint, required, className, id: idProp, ...props }, ref) => {
    const { t } = useTranslation();
    const autoId = useId();
    const id = idProp ?? autoId;
    const errorId = `${id}-error`;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw.trim() === '') return onChange(null);
      const n = parseTzs(raw);
      // Ignore keystrokes that would make the value non-integer (e.g. ".")
      if (n == null) return;
      onChange(n);
    };

    return (
      <div className={className}>
        {label && (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        )}
        <div
          className={cn(
            'flex h-touch w-full items-stretch overflow-hidden rounded border border-border bg-surface',
            'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30',
            error && 'border-error focus-within:border-error focus-within:ring-error/30',
          )}
        >
          <span className="flex select-none items-center border-r border-border bg-surface-muted px-3 text-base text-text-muted">
            {t('money.currency')}
          </span>
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode="numeric"
            value={display(value)}
            onChange={handleChange}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            required={required}
            className="tabular w-full bg-transparent px-3 text-right text-base text-text placeholder:text-text-subtle focus:outline-none"
            placeholder="0"
            {...props}
          />
        </div>
        {hint && <p className="mt-1.5 text-sm text-text-subtle">{hint}</p>}
        <FieldError id={errorId} message={error} />
      </div>
    );
  },
);
AmountInput.displayName = 'AmountInput';
