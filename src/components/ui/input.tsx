import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, type = 'text', ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    aria-invalid={invalid || undefined}
    className={cn(
      'flex h-touch w-full rounded border border-border bg-surface px-3 text-base text-text placeholder:text-text-subtle',
      'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
      'disabled:cursor-not-allowed disabled:bg-surface-muted',
      invalid && 'border-error focus-visible:border-error focus-visible:ring-error/30',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
