// Client account passwords (customer_auth). PBKDF2-SHA256 through WebCrypto, so it runs the
// same in Deno and Vitest with no dependency. Stored as
//   pbkdf2$sha256$<iterations>$<salt b64url>$<hash b64url>
// The iteration count travels with the hash, so it can be raised later without breaking
// existing accounts.
import { timingSafeEqual } from './otp.ts';

const ITERATIONS = 210_000;
const KEY_BITS = 256;
const encoder = new TextEncoder();

function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  );
  return toB64Url(new Uint8Array(bits));
}

export async function hashPassword(password: string, iterations = ITERATIONS): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return `pbkdf2$sha256$${iterations}$${toB64Url(salt)}$${await derive(password, salt, iterations)}`;
}

/** Constant-time check; false (never a throw) for a malformed or unknown hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, algo, iter, salt, hash] = stored.split('$');
  const iterations = Number(iter);
  if (scheme !== 'pbkdf2' || algo !== 'sha256' || !salt || !hash || !Number.isInteger(iterations))
    return false;
  if (iterations < 1 || iterations > 10_000_000) return false;
  try {
    return timingSafeEqual(await derive(password, fromB64Url(salt), iterations), hash);
  } catch {
    return false;
  }
}

/** Burn the same time as a real check when the phone has no account (no user enumeration). */
export async function dummyVerify(password: string): Promise<void> {
  await derive(password, new Uint8Array(16), ITERATIONS);
}
