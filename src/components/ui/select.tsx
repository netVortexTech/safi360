import { ChevronDown } from '@/components/ui/icons';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean | undefined;
}

/** Native select styled like Input. Native keeps it accessible and works on every phone. */
const Select = forwardRef<HTMLSelectElement, SelectProps>(({ className, invalid, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        'flex h-touch w-full appearance-none rounded border border-border-strong bg-surface pl-3.5 pr-10 text-base text-text shadow-xs',
        'transition-[border-color,box-shadow] duration-200 ease-premium',
        'hover:border-text-subtle/60',
        'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-0 focus-visible:shadow-none',
        'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted',
        invalid && 'border-error hover:border-error focus-visible:border-error focus-visible:ring-error/25',
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
      aria-hidden="true"
    />
  </div>
));
Select.displayName = 'Select';

export { Select };
