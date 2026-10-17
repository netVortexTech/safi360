import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface QuickAddCleanerValues {
  display_name: string;
  phone_e164: string;
}

/**
 * One-tap add for a field employee: the name and phone are enough. The roster row is
 * created now; if the phone already has an account the login is linked and granted
 * access immediately, otherwise they get access on their first cleaner-app login.
 */
export function QuickAddCleanerDialog({
  open,
  busy,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: QuickAddCleanerValues) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setPhoneRaw('');
      setPhoneE164(null);
      setTouched(false);
    }
  }, [open]);

  const nameError = touched && !name.trim() ? t('validation.required') : undefined;
  const phoneError = touched && !phoneE164 ? t('phone.errors.too_short') : undefined;

  const submit = () => {
    setTouched(true);
    if (!name.trim() || !phoneE164) return;
    onSubmit({ display_name: name.trim(), phone_e164: phoneE164 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('staff.quick_add')}</DialogTitle>
          <DialogDescription>{t('staff.quick_add_body')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id={`${id}-name`} label={t('staff.field.name')} required error={nameError}>
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              autoFocus
            />
          </Field>
          <PhoneInput
            id={`${id}-phone`}
            label={t('staff.field.login_phone')}
            hint={t('staff.quick_add_phone_hint')}
            value={phoneRaw}
            onChange={(raw, e164) => {
              setPhoneRaw(raw);
              setPhoneE164(e164);
            }}
            error={phoneError}
            required
          />
          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t('staff.quick_add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
