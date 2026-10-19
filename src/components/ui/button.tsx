import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from '@/components/ui/icons';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded font-medium ' +
    'transition-[color,background-color,border-color,opacity,box-shadow,transform,filter] duration-150 active:scale-[0.97] ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-hover',
        brand: 'bg-brand text-brand-foreground hover:brightness-95 active:brightness-90',
        secondary: 'border border-border bg-surface text-text hover:bg-surface-muted',
        tertiary: 'border border-primary/40 bg-surface text-primary hover:bg-primary-light',
        ghost: 'text-text hover:bg-surface-muted',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100 active:opacity-70',
        destructive: 'bg-error text-primary-foreground hover:bg-error-text',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-touch px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        field: 'h-touch-field px-6 text-base', // 56px targets in the cleaner app
        icon: 'size-touch',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * While true the button is disabled, shows a spinner, sets aria-busy and swaps its
   * label for `loadingLabel` without changing width (ui-spec principle 1).
   */
  loading?: boolean;
  loadingLabel?: ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, loadingLabel, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    const hasLoadingLabel = loading && loadingLabel != null;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        {/* Both labels occupy the same grid cell so the button keeps the wider width. */}
        <span className="grid place-items-center">
          <span
            className={cn('col-start-1 row-start-1 inline-flex items-center gap-2', loading && 'invisible')}
            aria-hidden={loading || undefined}
          >
            {children}
          </span>
          <span
            className={cn(
              'col-start-1 row-start-1 inline-flex items-center gap-2',
              !loading && 'invisible',
            )}
            aria-hidden={!loading || undefined}
          >
            <Loader2 className="animate-spin" aria-hidden="true" />
            {hasLoadingLabel ? loadingLabel : children}
          </span>
        </span>
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
