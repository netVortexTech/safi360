import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// Tinted background + icon + text; never colour alone (ui-spec).
const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-medium [&_svg]:size-3.5',
  {
    variants: {
      tone: {
        neutral: 'border-transparent bg-surface-muted text-text-muted',
        outline: 'border-border-strong bg-surface text-text-muted',
        primary: 'border-transparent bg-primary-light text-primary',
        success: 'border-transparent bg-success-tint text-success-text',
        warning: 'border-transparent bg-warning-tint text-warning-text',
        error: 'border-transparent bg-error-tint text-error-text',
        info: 'border-transparent bg-info-tint text-info-text',
        amber: 'border-transparent bg-amber text-amber-foreground',
        navy: 'border-transparent bg-navy text-navy-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { badgeVariants };
