/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-type-assertion */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  MapPin,
  PartyPopper,
  Plus,
  Search,
  Share2,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSearchCustomers } from '../customers/hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Field } from '@/components/shared/Field';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatTzs } from '@/lib/money';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { BOOKING_SOURCES } from '@shared/enums';
import type { BookingSource } from '@shared/enums';
import { TicketChip } from '@/components/shared/TicketChip';

type Step = 'customer' | 'services' | 'location' | 'price' | 'save';

const STEPS: { key: Step; label: string }[] = [
  { key: 'customer', label: 'Customer' },
  { key: 'services', label: 'Services' },
  { key: 'location', label: 'Location & time' },
  { key: 'price', label: 'Price & payment' },
  { key: 'save', label: 'Save' },
];

interface SelectedService {
  service_id: string;
  name: string;
  qty: number;
  unit_price_tzs: number;
  amount_tzs: number;
}

export function CreateBookingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { userId } = useAuth();

  const [step, setStep] = useState<Step>('customer');
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());

  // Customer state
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerLocale, setCustomerLocale] = useState<'sw' | 'en'>('sw');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [possibleDuplicate, setPossibleDuplicate] = useState<string | null>(null);

  // Services state
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  // Location state
  const [addressLabel, setAddressLabel] = useState('');
  const [addressArea, setAddressArea] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressLandmark, setAddressLandmark] = useState('');

  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  // Price & payment state
  const [source, setSource] = useState<BookingSource>('phone');
  const [paymentMode, setPaymentMode] = useState<'DEPOSIT' | 'ON_COMPLETION'>('ON_COMPLETION');
  const [priceOverride, setPriceOverride] = useState('');
  const [priceOverrideReason, setPriceOverrideReason] = useState('');
  const [conversationNote, setConversationNote] = useState('');

  // Save state
  const [createdTicket, setCreatedTicket] = useState<string | null>(null);
  const [createdTicketRef, setCreatedTicketRef] = useState<string | null>(null);
  const [createdStatus, setCreatedStatus] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const { data: customerResults, isLoading: searchingCustomers } = useSearchCustomers(customerSearch);

  const markComplete = (s: Step) => {
    setCompletedSteps((prev) => new Set(prev).add(s));
  };

  const goNext = () => {
    markComplete(step);
    const idx = STEPS.findIndex((s) => s.key === step);
    const next = idx >= 0 ? STEPS[idx + 1] : undefined;
    if (idx < STEPS.length - 1 && next) setStep(next.key);
  };

  const goBack = () => {
    const idx = STEPS.findIndex((s) => s.key === step);
    const prev = idx > 0 ? STEPS[idx - 1] : undefined;
    if (idx > 0 && prev) setStep(prev.key);
  };

  const canProceed = useMemo(() => {
    switch (step) {
      case 'customer':
        return selectedCustomerId !== null || (customerName.trim() && customerPhone.trim());
      case 'services':
        return selectedServices.length > 0;
      case 'location':
        return true; // location is optional
      case 'price':
        return selectedServices.length > 0;
      case 'save':
        return false;
      default:
        return false;
    }
  }, [step, selectedCustomerId, customerName, customerPhone, selectedServices]);

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  const handleCreateBooking = (saveAs: 'DRAFT' | 'REQUEST' | 'CONFIRMED') => {
    setCreateError(null);
    setDraftSaved(false);

    const draft = {
      customerName,
      customerPhone,
      customerEmail,
      customerLocale,
      selectedServices,
      addressLabel,
      addressArea,
      addressStreet,
      addressLandmark,
      scheduledDate,
      scheduledTime,
      source,
      paymentMode,
      priceOverride,
      priceOverrideReason,
      conversationNote,
    };

    if (saveAs === 'DRAFT') {
      try {
        window.localStorage.setItem('ops-booking-draft', JSON.stringify(draft));
        setDraftSaved(true);
      } catch {
        setCreateError(t('errors.generic_body'));
      }
      return;
    }

    void (async () => {
    try {
      setCreating(true);
      // Build the booking payload
      const items = selectedServices.map((s) => ({
        service_id: s.service_id,
        label_sw: s.name,
        label_en: s.name,
        qty: s.qty,
        amount_tzs: s.amount_tzs,
        requires_review: false,
        input: {},
      }));

      const totalTzs = selectedServices.reduce((s, i) => s + i.amount_tzs, 0);
      const depositTzs = paymentMode === 'DEPOSIT' && totalTzs > 0 ? Math.round(totalTzs * 0.3) : 0;

      const schedule =
        scheduledDate || saveAs === 'CONFIRMED'
          ? {
              start: new Date(`${scheduledDate || new Date().toISOString().slice(0, 10)}T${scheduledTime}:00`).toISOString(),
              end: new Date(
                new Date(`${scheduledDate || new Date().toISOString().slice(0, 10)}T${scheduledTime}:00`).getTime() +
                  120 * 60000,
              ).toISOString(),
              capacity: 10,
            }
          : null;

      const payload = {
        source,
        locale: customerLocale,
        created_by: userId ?? null,
        customer: selectedCustomerId
          ? { phone_e164: customerPhone }
          : {
              phone_e164: customerPhone,
              name: customerName,
              email: customerEmail || null,
              phone_verified: false,
            },
        address:
          addressArea || addressStreet
            ? {
                label: addressLabel || null,
                area: addressArea || null,
                street: addressStreet || null,
                landmark: addressLandmark || null,
                lat: null,
                lng: null,
              }
            : null,
        quote: {
          total_tzs: totalTzs,
          deposit_tzs: depositTzs,
          subtotal_tzs: totalTzs,
          travel_fee_tzs: 0,
          discount_tzs: 0,
          tax_tzs: 0,
          requires_review: false,
          has_estimate: false,
          est_duration_min: 120,
          crew_size: 1,
        },
        items,
        schedule,
        payment_mode: paymentMode,
        notes_customer: conversationNote || null,
      };

      const { data, error } = await supabase.rpc('create_booking_tx', {
        p: payload,
      });

      if (error) throw error;

      const result = data as { booking_id: string; ticket_ref: string; status: string };
      setCreatedTicket(result.booking_id);
      setCreatedTicketRef(result.ticket_ref);
      setCreatedStatus(result.status);
      try {
        window.localStorage.removeItem('ops-booking-draft');
      } catch {
        // ignore storage errors
      }
      setStep('save');
      markComplete('save');

      await qc.invalidateQueries({ queryKey: ['tickets'] });
      await qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      console.error('Failed to create booking:', err);
      setCreateError(t('errors.generic_body'));
    } finally {
      setCreating(false);
    }
    })();
  };

  // Success screen
  if (step === 'save' && createdTicketRef) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-lg text-center">
          <CardBody className="p-8">
            <PartyPopper className="mx-auto mb-4 size-16 text-success" aria-hidden="true" />
            <h2 className="text-h1">{t('ops.booking_created')}</h2>
            <p className="mt-2 text-text-subtitle">
              {t('ops.booking_created_body', { ticket: createdTicketRef })}
            </p>
            <div className="mt-6 rounded-lg bg-surface-muted p-4">
              <TicketChip ticketRef={createdTicketRef} size="display" />
              <p className="mt-2 text-sm text-text-subtle">
                {t('status.' + (createdStatus ?? 'REQUEST_RECEIVED'))}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => { void navigator.clipboard.writeText(createdTicketRef); }}
              >
                <Copy aria-hidden="true" />
                {t('common.copy')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const url = `${window.location.origin}/track/${createdTicket}`;
                  if (navigator.share) {
                    void navigator.share({ title: createdTicketRef, url });
                  } else {
                    void navigator.clipboard.writeText(url);
                  }
                }}
              >
                <Share2 aria-hidden="true" />
                {t('common.share')}
              </Button>
              <Button onClick={() => navigate(`/ops/tickets/${createdTicket}`)}>
                {t('ops.view_ticket')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStep('customer');
                  setCompletedSteps(new Set());
                  setSelectedCustomerId(null);
                  setCustomerName('');
                  setCustomerPhone('');
                  setSelectedServices([]);
                  setCreatedTicket(null);
                  setCreatedTicketRef(null);
                }}
              >
                {t('ops.create_another')}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: t('nav.tickets'), to: '/ops/tickets' }]}
        title={t('nav.create_booking')}
        subtitle={t('ops.create_booking_subtitle')}
      />

      {/* Stepper */}
      <nav aria-label="Booking steps" className="mb-8">
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const isCompleted = completedSteps.has(s.key);
            const isCurrent = s.key === step;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted || i < stepIndex) setStep(s.key);
                  }}
                  disabled={!isCompleted && i > stepIndex}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    isCurrent
                      ? 'bg-primary text-white'
                      : isCompleted
                        ? 'bg-success text-white'
                        : 'bg-surface-muted text-text-subtle',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </button>
                <span
                  className={cn(
                    'hidden text-sm sm:inline',
                    isCurrent ? 'font-medium text-text' : 'text-text-subtle',
                  )}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px w-8 lg:w-12',
                      isCompleted ? 'bg-success' : 'bg-border',
                    )}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step Content */}
      <Card className="mx-auto max-w-2xl">
        <CardBody className="p-6">
          {step === 'customer' && (
            <CustomerStep
              search={customerSearch}
              onSearchChange={setCustomerSearch}
              results={customerResults ?? []}
              isLoading={searchingCustomers}
              selectedId={selectedCustomerId}
              onSelect={(id) => {
                setSelectedCustomerId(id);
                const c = customerResults?.find((r) => r.id === id);
                if (c) {
                  setCustomerPhone(c.phone_e164);
                  setCustomerName(c.name);
                  setCustomerLocale(c.locale);
                }
              }}
              showNew={showNewCustomer}
              onToggleNew={() => setShowNewCustomer(!showNewCustomer)}
              name={customerName}
              onNameChange={setCustomerName}
              phone={customerPhone}
              onPhoneChange={setCustomerPhone}
              email={customerEmail}
              onEmailChange={setCustomerEmail}
              locale={customerLocale}
              onLocaleChange={setCustomerLocale}
              possibleDuplicate={possibleDuplicate}
              onDismissDuplicate={() => setPossibleDuplicate(null)}
            />
          )}

          {step === 'services' && (
            <ServicesStep
              services={selectedServices}
              onChange={setSelectedServices}
            />
          )}

          {step === 'location' && (
            <LocationStep
              label={addressLabel}
              onLabelChange={setAddressLabel}
              area={addressArea}
              onAreaChange={setAddressArea}
              street={addressStreet}
              onStreetChange={setAddressStreet}
              landmark={addressLandmark}
              onLandmarkChange={setAddressLandmark}
              date={scheduledDate}
              onDateChange={setScheduledDate}
              time={scheduledTime}
              onTimeChange={setScheduledTime}
            />
          )}

          {step === 'price' && (
            <>
              <PriceStep
                services={selectedServices}
                source={source}
                onSourceChange={setSource}
                paymentMode={paymentMode}
                onPaymentModeChange={setPaymentMode}
                priceOverride={priceOverride}
                onPriceOverrideChange={setPriceOverride}
                priceOverrideReason={priceOverrideReason}
                onPriceOverrideReasonChange={setPriceOverrideReason}
                conversationNote={conversationNote}
                onConversationNoteChange={setConversationNote}
              />
              {createError && (
                <p role="alert" className="mt-4 rounded-lg border border-error/30 bg-error-tint/40 p-3 text-sm text-error">
                  {createError}
                </p>
              )}
              {draftSaved && (
                <p role="status" className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
                  {t('ops.draft_saved')}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  variant="secondary"
                  onClick={() => handleCreateBooking('DRAFT')}
                  disabled={creating}
                >
                  {t('ops.save_draft')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleCreateBooking('REQUEST')}
                  disabled={!canProceed || creating}
                  loading={creating}
                >
                  {t('ops.save_request')}
                </Button>
                <Button
                  onClick={() => handleCreateBooking('CONFIRMED')}
                  disabled={!canProceed || creating}
                  loading={creating}
                >
                  {t('ops.save_confirmed')}
                </Button>
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
            <Button
              variant="ghost"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              <ArrowLeft aria-hidden="true" />
              {t('common.back')}
            </Button>
            {step !== 'save' && step !== 'price' && (
              <Button onClick={goNext} disabled={!canProceed}>
                {t('common.continue')}
                <ArrowRight aria-hidden="true" />
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

function CustomerStep({
  search,
  onSearchChange,
  results,
  isLoading,
  selectedId,
  onSelect,
  showNew,
  onToggleNew,
  name,
  onNameChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  locale,
  onLocaleChange,
  possibleDuplicate,
  onDismissDuplicate,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  results: { id: string; name: string; phone_e164: string; email: string | null; locale: string }[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  showNew: boolean;
  onToggleNew: () => void;
  name: string;
  onNameChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  email: string;
  onEmailChange: (v: string) => void;
  locale: 'sw' | 'en';
  onLocaleChange: (v: 'sw' | 'en') => void;
  possibleDuplicate: string | null;
  onDismissDuplicate: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3">{t('ops.step.customer')}</h3>
        <p className="mt-1 text-sm text-text-subtle">{t('ops.customer_search_hint')}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle" aria-hidden="true" />
        <Input
          type="search"
          placeholder={t('ops.search_customer')}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value);
            if (selectedId) onSelect(null);
          }}
          className="pl-10"
        />
      </div>

      {/* Results */}
      {isLoading && <Skeleton className="h-20" />}
      {!isLoading && results.length > 0 && (
        <ul className="space-y-2">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  selectedId === c.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-surface-muted',
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text">{c.name}</p>
                    <p className="text-sm text-text-subtle">{c.phone_e164}</p>
                  </div>
                  {selectedId === c.id && (
                    <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Possible duplicate warning */}
      {possibleDuplicate && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium text-text">{t('ops.possible_duplicate')}</p>
              <p className="mt-1 text-text-subtle">
                {t('ops.possible_duplicate_body', { name: possibleDuplicate })}
              </p>
              <button
                type="button"
                onClick={onDismissDuplicate}
                className="mt-2 text-sm text-primary hover:underline"
              >
                {t('ops.different_customer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New customer form */}
      {showNew && (
        <div className="space-y-4 rounded-lg border border-border p-4">
          <h4 className="flex items-center gap-2 font-medium">
            <UserPlus className="size-4" aria-hidden="true" />
            {t('ops.new_customer')}
          </h4>
          <Field id="new-customer-name" label={t('portal.contact.name')} required>
            <Input id="new-customer-name" value={name} onChange={(e) => onNameChange(e.target.value)} />
          </Field>
          <Field id="new-customer-phone" label={t('portal.contact.phone')} required>
            <Input
              id="new-customer-phone"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="+255712345678"
            />
          </Field>
          <Field id="new-customer-email" label={t('portal.contact.email')}>
            <Input
              id="new-customer-email"
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
            />
          </Field>
          <Field id="new-customer-locale" label={t('ops.locale')}>
            <Select
              id="new-customer-locale"
              value={locale}
              onChange={(e) => onLocaleChange(e.target.value as 'sw' | 'en')}
            >
              <option value="sw">Kiswahili</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>
      )}

      {!showNew && (
        <Button variant="secondary" onClick={onToggleNew} className="w-full">
          <UserPlus aria-hidden="true" />
          {t('ops.new_customer')}
        </Button>
      )}
    </div>
  );
}

function ServicesStep({
  services,
  onChange,
}: {
  services: SelectedService[];
  onChange: (s: SelectedService[]) => void;
}) {
  const { t } = useTranslation();
  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en, name_sw, pricing_type, pricing_rule, active, crew_size')
        .eq('active', true)
        .is('deleted_at', null)
        .order('sort');
      if (error) throw error;
      return data as Record<string, unknown>[];
    },
  });

  const catalogItems = (catalog ?? []).map((s) => ({
    id: s.id as string,
    name: (s.name_en as string) || (s.name_sw as string),
    pricing_type: s.pricing_type as string,
    pricing_rule: s.pricing_rule as Record<string, unknown>,
  }));

  const addService = (item: { id: string; name: string; pricing_rule: Record<string, unknown> }) => {
    const rule = item.pricing_rule;
    const price = (rule.flat_price_tzs as number) ?? (rule.price_per_unit_tzs as number) ?? 0;
    const existing = services.find((s) => s.service_id === item.id);
    if (existing) {
      onChange(
        services.map((s) =>
          s.service_id === item.id ? { ...s, qty: s.qty + 1, amount_tzs: (s.qty + 1) * price } : s,
        ),
      );
    } else {
      onChange([
        ...services,
        { service_id: item.id, name: item.name, qty: 1, unit_price_tzs: price, amount_tzs: price },
      ]);
    }
  };

  const removeService = (id: string) => {
    onChange(services.filter((s) => s.service_id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3">{t('ops.step.services')}</h3>
        <p className="mt-1 text-sm text-text-subtle">{t('ops.services_hint')}</p>
      </div>

      {/* Selected services */}
      {services.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h4 className="mb-3 font-medium">{t('ops.selected_services')}</h4>
          <ul className="space-y-2">
            {services.map((s) => (
              <li key={s.service_id} className="flex items-center justify-between text-sm">
                <span className="text-text">{s.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="outline">×{s.qty}</Badge>
                  <span className="tabular font-medium">{formatTzs(s.amount_tzs)}</span>
                  <Button variant="ghost" size="icon" onClick={() => removeService(s.service_id)}>
                    ×
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add services */}
      <div>
        <h4 className="mb-2 text-sm font-medium text-text-subtle">{t('ops.add_service')}</h4>
        <ul className="space-y-2">
          {catalogItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => addService(item)}
                className="flex w-full items-center justify-between rounded-lg border border-border p-3 text-left transition-colors hover:bg-surface-muted"
              >
                <span className="font-medium text-text">{item.name}</span>
                <Plus className="size-4 text-primary" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LocationStep({
  label,
  onLabelChange,
  area,
  onAreaChange,
  street,
  onStreetChange,
  landmark,
  onLandmarkChange,
  date,
  onDateChange,
  time,
  onTimeChange,
}: {
  label: string;
  onLabelChange: (v: string) => void;
  area: string;
  onAreaChange: (v: string) => void;
  street: string;
  onStreetChange: (v: string) => void;
  landmark: string;
  onLandmarkChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  time: string;
  onTimeChange: (v: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3">{t('ops.step.location_time')}</h3>
        <p className="mt-1 text-sm text-text-subtle">{t('ops.location_hint')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="booking-address-label" label={t('ops.address_label')}>
          <Input id="booking-address-label" value={label} onChange={(e) => onLabelChange(e.target.value)} placeholder={t('portal.location.title')} />
        </Field>
        <Field id="booking-address-area" label={t('portal.location.area')}>
          <Input id="booking-address-area" value={area} onChange={(e) => onAreaChange(e.target.value)} placeholder={t('portal.location.area_placeholder')} />
        </Field>
        <Field id="booking-address-street" label={t('portal.location.street')}>
          <Input id="booking-address-street" value={street} onChange={(e) => onStreetChange(e.target.value)} />
        </Field>
        <Field id="booking-address-landmark" label={t('portal.location.landmark')}>
          <Input id="booking-address-landmark" value={landmark} onChange={(e) => onLandmarkChange(e.target.value)} placeholder={t('portal.location.landmark_placeholder')} />
        </Field>
      </div>

      <div className="border-t border-border pt-4">
        <h4 className="mb-3 flex items-center gap-2 font-medium">
          <MapPin className="size-4" aria-hidden="true" />
          {t('ops.preferred_time')}
        </h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="booking-date" label={t('ops.date')}>
            <Input id="booking-date" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          </Field>
          <Field id="booking-time" label={t('ops.time')}>
            <Input id="booking-time" type="time" value={time} onChange={(e) => onTimeChange(e.target.value)} />
          </Field>
        </div>
      </div>
    </div>
  );
}

function PriceStep({
  services,
  source,
  onSourceChange,
  paymentMode,
  onPaymentModeChange,
  priceOverride,
  onPriceOverrideChange,
  priceOverrideReason,
  onPriceOverrideReasonChange,
  conversationNote,
  onConversationNoteChange,
}: {
  services: SelectedService[];
  source: BookingSource;
  onSourceChange: (v: BookingSource) => void;
  paymentMode: 'DEPOSIT' | 'ON_COMPLETION';
  onPaymentModeChange: (v: 'DEPOSIT' | 'ON_COMPLETION') => void;
  priceOverride: string;
  onPriceOverrideChange: (v: string) => void;
  priceOverrideReason: string;
  onPriceOverrideReasonChange: (v: string) => void;
  conversationNote: string;
  onConversationNoteChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const totalTzs = services.reduce((s, i) => s + i.amount_tzs, 0);
  const depositTzs = paymentMode === 'DEPOSIT' && totalTzs > 0 ? Math.round(totalTzs * 0.3) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3">{t('ops.step.price_payment')}</h3>
        <p className="mt-1 text-sm text-text-subtle">{t('ops.price_hint')}</p>
      </div>

      {/* Source */}
      <Field id="booking-source" label={t('ops.source')} required>
        <Select
          id="booking-source"
          value={source}
          onChange={(e) => onSourceChange(e.target.value as BookingSource)}
        >
          {BOOKING_SOURCES.map((s) => (
            <option key={s} value={s}>{t(`source.${s}`)}</option>
          ))}
        </Select>
      </Field>

      {/* Payment mode */}
      <Field id="booking-payment-mode" label={t('ops.payment_mode')}>
        <Select
          id="booking-payment-mode"
          value={paymentMode}
          onChange={(e) => onPaymentModeChange(e.target.value as 'DEPOSIT' | 'ON_COMPLETION')}
        >
          <option value="ON_COMPLETION">{t('portal.review.pay_later')}</option>
          <option value="DEPOSIT">{t('portal.review.pay_deposit')}</option>
        </Select>
      </Field>

      {/* Price summary */}
      <div className="rounded-lg bg-surface-muted p-4">
        <div className="flex justify-between text-sm">
          <span className="text-text-subtle">{t('ops.subtotal')}</span>
          <span className="tabular font-medium">{formatTzs(totalTzs)}</span>
        </div>
        {paymentMode === 'DEPOSIT' && depositTzs > 0 && (
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-text-subtle">{t('ops.deposit_due')}</span>
            <span className="tabular font-medium text-primary">{formatTzs(depositTzs)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
          <span>{t('ops.total')}</span>
          <span className="tabular">{formatTzs(totalTzs)}</span>
        </div>
      </div>

      {/* Price override */}
      <Field id="booking-price-override" label={t('ops.price_override')}>
        <Input
          id="booking-price-override"
          value={priceOverride}
          onChange={(e) => onPriceOverrideChange(e.target.value)}
          placeholder={String(totalTzs)}
          inputMode="numeric"
        />
      </Field>
      {priceOverride && (
        <Field id="booking-price-override-reason" label={t('ops.price_override_reason')} required>
          <Textarea
            id="booking-price-override-reason"
            value={priceOverrideReason}
            onChange={(e) => onPriceOverrideReasonChange(e.target.value)}
            rows={2}
          />
        </Field>
      )}

      {/* Conversation note */}
      <Field id="booking-conversation-note" label={t('ops.conversation_note')}>
        <Textarea
          id="booking-conversation-note"
          value={conversationNote}
          onChange={(e) => onConversationNoteChange(e.target.value)}
          rows={3}
          placeholder={t('ops.conversation_note_placeholder')}
        />
      </Field>
    </div>
  );
}

export default CreateBookingPage;
