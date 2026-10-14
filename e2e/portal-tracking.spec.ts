import { expect, LIVE, PHONE_NATIONAL, SANDBOX_CODE, seededBooking, test } from './fixtures/booking-api';

const SLUG = 'usafi-bora';

test.describe('portal tracking', () => {
  test('reveals nothing before verification and nothing on a wrong code', async ({ page, backend }) => {
    test.skip(LIVE, 'inspects the fake store');
    await page.goto(`/${SLUG}/track?lang=en`);
    await expect(page.getByRole('heading', { level: 1, name: 'Track my booking' })).toBeVisible();
    await expect(page.getByTestId('timeline')).toHaveCount(0);

    const viewCalls: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/functions/v1/tracking_view')) viewCalls.push(r.url());
    });

    await page.getByLabel(/Ticket number/).fill('UBC-2026-00042');
    await page.getByLabel(/Phone number/).fill(PHONE_NATIONAL);
    await page.getByRole('button', { name: 'Send code' }).click();
    await expect(page.getByTestId('otp-code')).toBeVisible();
    // The server always says "code sent"; the page shows no booking data.
    await expect(page.getByText(/UBC-2026-00042/)).toHaveCount(0);

    await page.getByLabel('Verification code 1/6').focus();
    await page.keyboard.type('000000');
    await expect(page.getByText(/That code is not right/)).toBeVisible();
    await expect(page.getByTestId('track-list')).toHaveCount(0);
    await expect(page.getByTestId('timeline')).toHaveCount(0);
    expect(viewCalls).toEqual([]);
    expect(backend!.calls.tracking_view ?? 0).toBe(0);
  });

  test('a verified phone sees its booking timeline and can request a new time', async ({ page, backend }) => {
    test.skip(LIVE, 'seeds the fake store');
    const start = new Date(Date.now() + 3 * 86_400_000);
    backend!.bookings.push(
      seededBooking({
        id: '00000000-0000-4000-8000-000000000777',
        ticket_ref: 'UBC-2026-00777',
        slot: { start: start.toISOString(), end: new Date(start.getTime() + 8_100_000).toISOString() },
      }),
    );

    await page.goto(`/${SLUG}/track?lang=en`);
    await page.getByLabel(/Ticket number/).fill('ubc-2026-00777');
    await page.getByLabel(/Phone number/).fill(PHONE_NATIONAL);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Verification code 1/6').focus();
    await page.keyboard.type(SANDBOX_CODE);

    await expect(page.getByTestId('track-booking')).toHaveAttribute('data-status', 'CONFIRMED', {
      timeout: 20_000,
    });
    await expect(page.getByText('UBC-2026-00777')).toBeVisible();
    await expect(page.getByTestId('timeline')).toContainText('Confirmed');
    await page.getByRole('button', { name: 'Request another time' }).click();
    await page.getByLabel('Note').fill('Morning please');
    await page.getByRole('dialog').getByRole('button', { name: 'Request another time' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Request sent/ })).toBeVisible();
    await expect(page.getByTestId('timeline')).toContainText('New time requested');
  });

  test('lost-ticket recovery lists every booking on the phone', async ({ page, backend }) => {
    test.skip(LIVE, 'seeds the fake store');
    backend!.bookings.push(
      seededBooking({
        id: '00000000-0000-4000-8000-000000000801',
        ticket_ref: 'UBC-2026-00801',
        status: 'CONFIRMED',
      }),
      seededBooking({
        id: '00000000-0000-4000-8000-000000000802',
        ticket_ref: 'UBC-2026-00802',
        status: 'COMPLETED',
      }),
    );
    await page.goto(`/${SLUG}/track/recover?lang=en`);
    await expect(page.getByRole('heading', { level: 1, name: 'Find my bookings' })).toBeVisible();
    await expect(page.getByLabel(/Ticket number/)).toHaveCount(0);
    await page.getByLabel(/Phone number/).fill(PHONE_NATIONAL);
    await page.getByRole('button', { name: 'Send code' }).click();
    await page.getByLabel('Verification code 1/6').focus();
    await page.keyboard.type(SANDBOX_CODE);
    await expect(page.getByTestId('track-list')).toBeVisible();
    await expect(page.getByRole('link', { name: /UBC-2026-00801/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /UBC-2026-00802/ })).toBeVisible();
  });
});
