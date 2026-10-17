import * as SwitchPrimitive from '@radix-ui/react-switch';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> {
  label?: string;
  description?: string | undefined;
}

/** Toggle with a visible label; the label is the click target too (44px row). */
const Switch = forwardRef<ElementRef<typeof SwitchPrimitive.Root>, SwitchProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const control = (
      <SwitchPrimitive.Root
        ref={ref}
        id={id}
        className={cn(
          'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-premium',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-border-strong',
          className,
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-premium data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
      </SwitchPrimitive.Root>
    );
    if (!label) return control;
    return (
      <label htmlFor={id} className="flex min-h-touch cursor-pointer items-center justify-between gap-4">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text">{label}</span>
          {description && <span className="block text-sm text-text-subtle">{description}</span>}
        </span>
        {control}
      </label>
    );
  },
);
Switch.displayName = 'Switch';

export { Switch };
