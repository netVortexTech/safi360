import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: string | undefined;
}

/** Native checkbox with a 44px label row. */
const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, description, id: idProp, ...props }, ref) => {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label htmlFor={id} className={cn('flex min-h-touch cursor-pointer items-start gap-3 py-2', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md border-border-strong accent-primary focus-visible:ring-2 focus-visible:ring-primary"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        {description && <span className="block text-sm text-text-subtle">{description}</span>}
      </span>
    </label>
  );
});
Checkbox.displayName = 'Checkbox';

export { Checkbox };
