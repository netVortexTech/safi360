import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password.ts';

describe('password hashing', () => {
  it('round-trips with the production iteration count and salts every hash', async () => {
    const a = await hashPassword('siri123');
    const b = await hashPassword('siri123');
    expect(a).toMatch(/^pbkdf2\$sha256\$210000\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('siri123', a)).toBe(true);
    expect(await verifyPassword('Siri123', a)).toBe(false);
  });

  it('rejects malformed hashes without throwing', async () => {
    for (const bad of ['', 'plain', 'pbkdf2$sha1$1000$a$b', 'pbkdf2$sha256$abc$a$b', 'pbkdf2$sha256$0$a$b']) {
      expect(await verifyPassword('x', bad)).toBe(false);
    }
  });
});
