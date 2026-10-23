import { forwardRef, useId, useState, type ChangeEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { formatPhone, normalizeTzPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type'
> {
  label?: string;
  /** Controlled value: the raw national digits the user typed (not E.164). */
  value: string;
  /** Receives the raw input and the normalised E.164 value (null while invalid). */
  onChange: (raw: string, e164: string | null) => void;
  /** Server/field error; overrides the local validation message. */
  error?: string | undefined;
  hint?: string | undefined;
  showHint?: boolean;
}

/**
 * +255 prefix, numeric keyboard, live normalisation and an inline error under the field.
 * The parent stores E.164; this component only ever shows the national part.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  (
    { label, value, onChange, error, hint, showHint = true, required, className, id: idProp, ...props },
    ref,
  ) => {
    const { t } = useTranslation();
    const autoId = useId();
    const id = idProp ?? autoId;
    const errorId = `${id}-error`;
    const hintId = `${id}-hint`;
    const [touched, setTouched] = useState(false);

    const parsed = normalizeTzPhone(value);
    const localError =
      touched && value.length > 0 && !parsed.ok ? t(`phone.errors.${parsed.reason}`) : undefined;
    const message = error ?? localError;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/[^\d\s]/g, '');
      const next = normalizeTzPhone(raw);
      onChange(raw, next.ok ? next.e164 : null);
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
            'border-border-strong shadow-xs flex h-touch w-full items-stretch overflow-hidden rounded border bg-surface',
            'ease-premium transition-[border-color,box-shadow] duration-200 hover:border-text-subtle/60',
            'focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25',
            message && 'border-error focus-within:border-error focus-within:ring-error/25 hover:border-error',
          )}
        >
          <span className="border-border-strong flex select-none items-center border-r bg-surface-muted px-3 text-base text-text-muted">
            +255
          </span>
          <input
            ref={ref}
            id={id}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={value}
            onChange={handleChange}
            onBlur={() => setTouched(true)}
            aria-invalid={message ? true : undefined}
            aria-describedby={
              [message ? errorId : null, showHint ? hintId : null].filter(Boolean).join(' ') || undefined
            }
            required={required}
            className="tabular w-full bg-transparent px-3 text-base text-text placeholder:text-text-subtle focus:outline-none"
            placeholder="754 123 456"
            {...props}
          />
        </div>
        {showHint && (
          <p id={hintId} className="mt-1.5 text-sm text-text-subtle">
            {hint ?? (parsed.ok ? t('phone.hint', { formatted: formatPhone(parsed.e164) }) : ' ')}
          </p>
        )}
        <FieldError id={errorId} message={message} />
      </div>
    );
  },
);
PhoneInput.displayName = 'PhoneInput';
