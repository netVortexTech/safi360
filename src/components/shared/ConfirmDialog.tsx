import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/Field';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  loadingLabel?: string | undefined;
  cancelLabel?: string | undefined;
  destructive?: boolean | undefined;
  loading?: boolean | undefined;
  /** When set, a reason is required and passed to onConfirm. */
  reasonLabel?: string | undefined;
  onConfirm: (reason?: string) => void;
}

/** Confirmation for consequential actions only (ui-spec). Destructive ones can demand a reason. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  loadingLabel,
  cancelLabel,
  destructive,
  loading,
  reasonLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const id = useId();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const needsReason = reasonLabel != null;
  const reasonError =
    needsReason && touched && reason.trim().length < 3 ? t('validation.reason_required') : undefined;

  const submit = () => {
    if (needsReason && reason.trim().length < 3) {
      setTouched(true);
      return;
    }
    onConfirm(needsReason ? reason.trim() : undefined);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {needsReason && (
          <Field id={`${id}-reason`} label={reasonLabel} required error={reasonError}>
            <Textarea
              id={`${id}-reason`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              invalid={!!reasonError}
              aria-describedby={reasonError ? `${id}-reason-error` : undefined}
              rows={3}
            />
          </Field>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading ?? false}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            onClick={submit}
            loading={loading ?? false}
            loadingLabel={loadingLabel ?? confirmLabel}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
