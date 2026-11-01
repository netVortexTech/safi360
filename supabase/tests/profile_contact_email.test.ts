// 0038 · the optional contact email from phone + password signup lands on the profile,
// and a duplicate or malformed one never blocks the account.
import { TestDb } from './harness.ts';

let db: TestDb;

const a = 'eeeeeeee-0000-4000-8000-000000000001';
const b = 'eeeeeeee-0000-4000-8000-000000000002';
const c = 'eeeeeeee-0000-4000-8000-000000000003';

beforeAll(async () => {
  db = await TestDb.create();
});
afterAll(() => db.close());

async function profile(id: string) {
  const [row] = await db.sql<{ phone_e164: string | null; email: string | null }>(
    'select phone_e164, email from public.profiles where id = $1',
    [id],
  );
  return row;
}

describe('handle_new_user contact email', () => {
  it('stores a well-formed email, lower-cased', async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754400001', '{"contact_email":" Neema@Example.com "}')`,
      [a],
    );
    expect(await profile(a)).toEqual({ phone_e164: '+255754400001', email: 'neema@example.com' });
  });

  it('still creates the profile when the email is already taken', async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754400002', '{"contact_email":"neema@example.com"}')`,
      [b],
    );
    expect(await profile(b)).toEqual({ phone_e164: '+255754400002', email: null });
  });

  it('drops a malformed email', async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754400003', '{"contact_email":"not-an-email"}')`,
      [c],
    );
    expect(await profile(c)).toEqual({ phone_e164: '+255754400003', email: null });
  });
});
