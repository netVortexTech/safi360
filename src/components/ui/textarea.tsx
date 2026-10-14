import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean | undefined;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex min-h-24 w-full rounded border border-border bg-surface px-3 py-2 text-base text-text placeholder:text-text-subtle',
      'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
      'disabled:cursor-not-allowed disabled:bg-surface-muted',
      invalid && 'border-error focus-visible:border-error focus-visible:ring-error/30',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
