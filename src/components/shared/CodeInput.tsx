import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface CodeInputProps {
  label: string;
  /** Digits typed so far (≤ length). */
  value: string;
  onChange: (value: string) => void;
  /** Called once the last digit is entered. */
  onComplete?: ((value: string) => void) | undefined;
  length?: number;
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean | undefined;
  autoFocus?: boolean | undefined;
}

/** Six boxes, numeric keyboard, paste-aware (Design system → Inputs → Verification code). */
export function CodeInput({
  label,
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  hint,
  disabled,
  autoFocus,
}: CodeInputProps) {
  const id = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      commit(value.slice(0, Math.max(0, index === value.length ? index - 1 : index)));
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      commit(value.slice(0, index) + e.key);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    commit(e.clipboardData.getData('text'));
  };

  return (
    <div>
      <Label id={`${id}-label`} htmlFor={`${id}-0`}>
        {label}
      </Label>
      <div className="flex gap-2" role="group" aria-labelledby={`${id}-label`}>
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${id}-${i}`}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={value[i] ?? ''}
            onChange={() => undefined}
            onKeyDown={onKeyDown(i)}
            onPaste={onPaste}
            onFocus={(e) => e.currentTarget.select()}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            aria-label={`${label} ${i + 1}/${length}`}
            aria-invalid={error ? true : undefined}
            className={cn(
              'tabular h-12 w-full min-w-0 max-w-12 flex-1 rounded border border-border-strong bg-surface text-center text-xl text-text shadow-xs',
              'transition-[border-color,box-shadow] duration-200 ease-premium',
              'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
              'disabled:bg-surface-muted',
              error && 'border-error',
            )}
          />
        ))}
      </div>
      {hint && <p className="mt-1.5 text-sm text-text-subtle">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
