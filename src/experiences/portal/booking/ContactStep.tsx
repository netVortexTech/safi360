import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Field } from '@/components/shared/Field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { usePortal } from '../context';
import { OtpVerify } from '../components/OtpVerify';
import type { BookingDraft, DraftAction } from './state';

export interface ContactStepProps {
  draft: BookingDraft;
  dispatch: (action: DraftAction) => void;
  /** Set after the server rejected an expired token: the visitor must verify again. */
  sessionExpired: boolean;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Step 4: name, verified phone, optional email and notes. */
export function ContactStep({ draft, dispatch, sessionExpired }: ContactStepProps) {
  const { t } = useTranslation();
  const { slug, locale } = usePortal();
  const id = useId();
  const { contact, verify } = draft;
  const nameError =
    contact.name.length > 0 && contact.name.trim().length < 2 ? t('validation.name.too_short') : undefined;
  const emailError =
    contact.email.length > 0 && !EMAIL.test(contact.email.trim()) ? t('validation.email.invalid') : undefined;

  return (
    <section aria-labelledby="step-contact" className="space-y-4">
      <div>
        <h2 id="step-contact" className="text-h2">
          {t('portal.contact.title')}
        </h2>
        <p className="text-sm text-text-muted">{t('portal.contact.body')}</p>
      </div>
      {sessionExpired && (
        <div role="alert" className="rounded-lg border border-warning/40 bg-warning-tint/50 p-4">
          <h3 className="text-h3 text-warning-text">{t('portal.review.session_expired_title')}</h3>
          <p className="mt-1 text-sm text-text-muted">{t('portal.review.session_expired_body')}</p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Field id={`${id}-name`} label={t('portal.contact.name')} required error={nameError}>
          <Input
            id={`${id}-name`}
            value={contact.name}
            onChange={(e) => dispatch({ type: 'set_contact', patch: { name: e.target.value } })}
            invalid={!!nameError}
            autoComplete="name"
          />
        </Field>
        <Field
          id={`${id}-email`}
          label={t('portal.contact.email')}
          hint={t('portal.contact.email_hint')}
          error={emailError}
        >
          <Input
            id={`${id}-email`}
            type="email"
            value={contact.email}
            onChange={(e) => dispatch({ type: 'set_contact', patch: { email: e.target.value } })}
            invalid={!!emailError}
            autoComplete="email"
          />
        </Field>
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <OtpVerify
          slug={slug}
          purpose="booking"
          locale={locale}
          phoneRaw={contact.phoneRaw}
          phoneE164={contact.phoneE164}
          onPhoneChange={(raw, e164) =>
            dispatch({ type: 'set_contact', patch: { phoneRaw: raw, phoneE164: e164 } })
          }
          verifiedPhone={verify?.phone ?? null}
          onVerified={(v) => dispatch({ type: 'set_verify', verify: v })}
        />
      </div>
      <Field id={`${id}-notes`} label={t('portal.contact.notes')} hint={t('common.optional')}>
        <Textarea
          id={`${id}-notes`}
          value={draft.notes}
          onChange={(e) => dispatch({ type: 'set_notes', notes: e.target.value.slice(0, 1000) })}
          placeholder={t('portal.contact.notes_placeholder')}
          rows={3}
        />
      </Field>
    </section>
  );
}
