import type { ReactNode } from 'react';
import { FieldError } from '@/components/ui/field-error';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FieldProps {
  /** id of the control inside; the label and error are wired to it. */
  id: string;
  label: string;
  required?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  className?: string;
  children: ReactNode;
}

/** Label above, control, hint, inline error. Use `${id}-error` as the control's aria-describedby when invalid. */
export function Field({ id, label, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-text-subtle">
          {hint}
        </p>
      )}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
