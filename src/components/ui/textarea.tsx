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
      'flex min-h-24 w-full rounded border border-border-strong bg-surface px-3.5 py-2.5 text-base text-text shadow-xs',
      'transition-[border-color,box-shadow] duration-200 ease-premium placeholder:text-text-subtle',
      'hover:border-text-subtle/60',
      'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0 focus-visible:shadow-none',
      'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted',
      invalid && 'border-error hover:border-error focus-visible:border-error focus-visible:ring-error/25',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
