import { expect, LIVE, PHONE_NATIONAL, SANDBOX_CODE, test } from './fixtures/booking-api';
import type { Page } from '@playwright/test';

const SLUG = 'usafi-bora';

async function openBooking(page: Page) {
  await page.goto(`/${SLUG}/book?lang=en`);
  await expect(page.getByRole('heading', { level: 1, name: 'Book a cleaning' })).toBeVisible();
}

async function addService(page: Page, name: RegExp) {
  await page
    .getByRole('button', { name: /Add a service|Add another service/ })
    .first()
    .click();
  await page.getByTestId('service-picker').getByRole('button', { name }).click();
}

async function fillLocation(page: Page) {
  await page.getByLabel(/Area or neighbourhood/).fill('Mbezi Beach');
  await expect(page.getByTestId('zone-match')).toContainText('Mbezi');
  await page.getByLabel(/Street or building/).fill('Sinza Road');
}

async function pickFirstSlot(page: Page) {
  const slot = page.locator('[data-slot-start]').first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  const start = await slot.getAttribute('data-slot-start');
  await slot.click();
  await expect(page.getByTestId('chosen-slot')).toBeVisible();
  return start as string;
}

async function verifyPhone(page: Page, name = 'Daudi Lyimo') {
  await page.getByLabel(/Full name/).fill(name);
  await page.getByLabel(/Phone number/).fill(PHONE_NATIONAL);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByTestId('otp-code')).toBeVisible();
  await page.getByLabel('Verification code 1/6').focus();
  await page.keyboard.type(SANDBOX_CODE);
  await expect(page.getByTestId('otp-verified')).toBeVisible();
}

const next = (page: Page) =>
  page.getByTestId('sticky-total').getByRole('button', { name: 'Continue' }).click();

test.describe('portal booking', () => {
  test('instant booking ends in "Booking confirmed" with a ticket number', async ({ page, backend }) => {
    await openBooking(page);
    await addService(page, /Sofa cleaning/);
    await expect(page.getByTestId('sticky-total-amount')).toHaveText('TZS 45,000'); // 1 seat → minimum charge
    await page.getByLabel('Seats +1').click();
    await page.getByLabel('Seats +1').click();
    await page.getByLabel('Seats +1').click();
    await page.getByLabel('Seats +1').click();
    await expect(page.getByTestId('sticky-total-amount')).toHaveText('TZS 75,000');
    await next(page);

    await fillLocation(page);
    await next(page);
    await pickFirstSlot(page);
    await next(page);
    await verifyPhone(page);
    await next(page);

    await expect(page.getByTestId('booking-stepper')).toHaveAttribute('data-step', 'review');
    await page.getByLabel(/Pay on completion/).check();
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/UBC-\d{4}-\d{5}/)).toBeVisible();
    await expect(page.getByTestId('booking-done')).toHaveAttribute('data-variant', 'confirmed');
    if (backend) expect(backend.bookings[0]?.status).toBe('CONFIRMED');
  });

  test('an inspection service ends in "Request received" without a payment', async ({ page }) => {
    await openBooking(page);
    await addService(page, /Mould & odour treatment/);
    await expect(page.getByTestId('sticky-total-amount')).toHaveText('After inspection');
    await next(page);
    await fillLocation(page);
    await next(page);
    // Preferred time is optional for a review: continue straight away.
    await expect(page.getByTestId('booking-stepper')).toHaveAttribute('data-step', 'time');
    await next(page);
    await verifyPhone(page);
    await next(page);
    await expect(page.getByText(/No payment yet/)).toBeVisible();
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Request received' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('payment-flow')).toHaveCount(0);
  });

  test('a deposit booking lands on "Awaiting payment" and the mock payment confirms it', async ({ page }) => {
    await openBooking(page);
    await addService(page, /Sofa cleaning/);
    await next(page);
    await fillLocation(page);
    await next(page);
    await pickFirstSlot(page);
    await next(page);
    await verifyPhone(page);
    await next(page);
    await page.getByLabel(/Pay the deposit now/).check();
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Awaiting payment' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId('hold-countdown')).toBeVisible();
    await page.getByRole('button', { name: 'Pay the deposit now' }).click();
    await expect(page.getByTestId('mock-payment')).toBeVisible();
    await page.getByTestId('mock-payment').getByRole('button', { name: 'Payment succeeds' }).click();
    // The provider's answer flips the page to the confirmed outcome.
    await expect(page.getByText('Deposit paid')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('a double submit returns the same ticket', async ({ page, backend }) => {
    test.skip(LIVE, 'needs the fake backend to simulate a lost response');
    await openBooking(page);
    await addService(page, /Sofa cleaning/);
    await next(page);
    await fillLocation(page);
    await next(page);
    await pickFirstSlot(page);
    await next(page);
    await verifyPhone(page);
    await next(page);
    backend!.failNextCreateAfterWrite();
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const firstTicket = backend!.bookings[0]?.ticket_ref;
    expect(firstTicket).toMatch(/^UBC-/);
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(firstTicket as string)).toBeVisible();
    expect(backend!.bookings).toHaveLength(1);
    expect(backend!.calls.create_booking).toBe(2);
  });

  test('a slot taken mid-flow sends the visitor back to pick another', async ({ page, backend }) => {
    test.skip(LIVE, 'needs the fake backend to take the slot');
    await openBooking(page);
    await addService(page, /Sofa cleaning/);
    await next(page);
    await fillLocation(page);
    await next(page);
    const start = await pickFirstSlot(page);
    await next(page);
    await verifyPhone(page);
    await next(page);
    backend!.takeSlot(start);
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByTestId('slot-taken')).toBeVisible();
    await expect(page.getByTestId('booking-stepper')).toHaveAttribute('data-step', 'time');
    await expect(page.locator(`[data-slot-start="${start}"]`)).toHaveCount(0);
    const second = await pickFirstSlot(page);
    expect(second).not.toBe(start);
    await next(page);
    await next(page); // contact is still verified
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('the widget route carries no portal chrome and records its source', async ({ page, backend }) => {
    test.skip(LIVE, 'inspects the fake store');
    await page.goto(`/${SLUG}/widget?lang=en`);
    await expect(page.getByTestId('booking-stepper')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await addService(page, /Fumigation, 3-bedroom house/);
    await next(page);
    await fillLocation(page);
    await next(page);
    await pickFirstSlot(page);
    await next(page);
    await verifyPhone(page);
    await next(page);
    await page.getByTestId('sticky-total').getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Booking confirmed' })).toBeVisible({
      timeout: 20_000,
    });
    expect(backend!.calls.create_booking).toBeGreaterThanOrEqual(1);
  });
});
