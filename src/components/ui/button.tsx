import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-medium ' +
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-premium ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
    'active:scale-[0.985] ' +
    'disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover hover:shadow-sm',
        brand: 'bg-brand text-brand-foreground shadow-xs hover:brightness-95 hover:shadow-sm',
        secondary:
          'border border-border bg-surface text-text shadow-xs hover:border-border-strong hover:bg-surface-muted',
        tertiary: 'border border-primary/25 bg-primary-light/60 text-primary hover:bg-primary-light',
        ghost: 'text-text-muted hover:bg-surface-muted hover:text-text',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
        destructive: 'bg-error text-primary-foreground shadow-xs hover:bg-error-text hover:shadow-sm',
      },
      size: {
        sm: 'h-9 px-3 text-small',
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
