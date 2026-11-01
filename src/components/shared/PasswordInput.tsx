import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { Input } from '@/components/ui/input';

export interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  /** "current-password" on sign-in, "new-password" when choosing one. */
  autoComplete: 'current-password' | 'new-password';
  autoFocus?: boolean;
  disabled?: boolean;
}

/** Labelled password field with a show/hide toggle (text, so it reads in both languages). */
export function PasswordInput({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  autoComplete,
  autoFocus,
  disabled,
}: PasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <Field id={id} label={label} required hint={hint} error={error}>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className="pr-20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-primary hover:underline"
          aria-controls={id}
          aria-pressed={visible}
        >
          {visible ? t('auth.hide_password') : t('auth.show_password')}
        </button>
      </div>
    </Field>
  );
}
