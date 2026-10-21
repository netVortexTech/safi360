import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from '@/components/ui/icons';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** center: modal card. sheet: bottom sheet on mobile (filters), centered card ≥768px. */
  variant?: 'center' | 'sheet';
  hideClose?: boolean;
}

const DialogContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, variant = 'center', hideClose = false, ...props }, ref) => {
    const { t } = useTranslation();
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-navy/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed z-50 flex max-h-[90dvh] w-full flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-overlay focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200',
            variant === 'center' &&
              'left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 data-[state=open]:zoom-in-95',
            variant === 'sheet' &&
              'safe-bottom inset-x-0 bottom-0 rounded-t-2xl rounded-b-none data-[state=open]:slide-in-from-bottom md:inset-x-auto md:left-1/2 md:top-1/2 md:bottom-auto md:w-[calc(100vw-2rem)] md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl',
            className,
          )}
          {...props}
        >
          {children}
          {!hideClose && (
            <DialogPrimitive.Close
              className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg text-text-subtle transition-colors hover:bg-surface-muted hover:text-text"
              aria-label={t('common.close')}
            >
              <X className="size-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
DialogContent.displayName = 'DialogContent';

function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 pr-10', className)} {...props} />;
}

function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-1 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-h2 text-text', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-text-muted', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
