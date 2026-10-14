import { XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FieldErrorProps {
  id: string;
  message?: string | undefined;
  className?: string;
}

/** Inline error under a field. Always rendered (empty) so the layout never jumps when an error appears. */
export function FieldError({ id, message, className }: FieldErrorProps) {
  return (
    <p id={id} role="alert" className={cn('mt-1.5 flex min-h-5 items-center gap-1 text-sm text-error-text', className)}>
      {message && (
        <>
          <XCircle className="size-4 shrink-0" aria-hidden="true" />
          <span>{message}</span>
        </>
      )}
    </p>
  );
}
