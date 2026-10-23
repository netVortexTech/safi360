// One-time codes and short-lived customer tokens. Pure Web Crypto, so Deno and Node
// (Vitest) share the implementation. Codes are stored only as salted SHA-256 hashes;
// tokens are HMAC-SHA256 signed JSON, never stored at all.

const encoder = new TextEncoder();

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const TOKEN_TTL_MS = 15 * 60_000;
/** The only code the Mock SMS adapter ever "sends". Accepted solely when OTP_PROVIDER=mock. */
export const SANDBOX_OTP_CODE = '123456';

export type OtpPurpose = 'booking' | 'tracking';

export interface CustomerTokenPayload {
  tenant_id: string;
  phone: string;
  purpose: OtpPurpose;
  /** Unix ms */
  exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function randomCode(): string {
  // Rejection sampling: draw again above the largest multiple of 10^6 so every
  // code is exactly equally likely (a bare modulo slightly favours low codes).
  const space = 10 ** OTP_LENGTH;
  const limit = 2 ** 32 - (2 ** 32 % space);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while ((buf[0] ?? 0) >= limit);
  return String((buf[0] ?? 0) % space).padStart(OTP_LENGTH, '0');
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashCode(code: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${salt}\u0000${code}`));
  return toBase64Url(new Uint8Array(digest));
}

/** Constant-time string compare for hashes and signatures. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
}

export async function hmac(secret: string, message: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

/** token = base64url(json) + "." + hmac(secret, base64url(json)) */
export async function signToken(payload: CustomerTokenPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export class TokenError extends Error {
  constructor(readonly code: 'token_invalid' | 'token_expired') {
    super(code);
    this.name = 'TokenError';
  }
}

export async function verifyToken(token: string, secret: string, now: Date): Promise<CustomerTokenPayload> {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new TokenError('token_invalid');
  if (!timingSafeEqual(await hmac(secret, body), sig)) throw new TokenError('token_invalid');
  let payload: Partial<CustomerTokenPayload>;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Partial<CustomerTokenPayload>;
  } catch {
    throw new TokenError('token_invalid');
  }
  if (
    typeof payload.tenant_id !== 'string' ||
    typeof payload.phone !== 'string' ||
    (payload.purpose !== 'booking' && payload.purpose !== 'tracking') ||
    typeof payload.exp !== 'number'
  ) {
    throw new TokenError('token_invalid');
  }
  if (payload.exp <= now.getTime()) throw new TokenError('token_expired');
  return payload as CustomerTokenPayload;
}
