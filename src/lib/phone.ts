// Tanzanian phone handling. Stored form is always E.164: +255XXXXXXXXX (9 national digits).
// Accepted inputs: "0754 123 456", "754123456", "255754123456", "+255 754 123 456", "00255...".

export const TZ_COUNTRY_CODE = '255';
export const TZ_NATIONAL_LENGTH = 9;

const E164_TZ = /^\+255[1-9]\d{8}$/;

export type PhoneParseResult =
  | { ok: true; e164: string; national: string }
  | { ok: false; reason: 'empty' | 'too_short' | 'too_long' | 'invalid_prefix' | 'not_tanzanian' };

/** Normalise any common Tanzanian phone input to E.164. Does not validate carrier ranges. */
export function normalizeTzPhone(input: string): PhoneParseResult {
  const digits = input.replace(/[^\d+]/g, '');
  if (digits.length === 0) return { ok: false, reason: 'empty' };

  let national: string;
  if (digits.startsWith('+')) {
    if (!digits.startsWith(`+${TZ_COUNTRY_CODE}`)) return { ok: false, reason: 'not_tanzanian' };
    national = digits.slice(1 + TZ_COUNTRY_CODE.length);
  } else if (digits.startsWith(`00${TZ_COUNTRY_CODE}`)) {
    national = digits.slice(2 + TZ_COUNTRY_CODE.length);
  } else if (
    digits.startsWith(TZ_COUNTRY_CODE) &&
    digits.length === TZ_COUNTRY_CODE.length + TZ_NATIONAL_LENGTH
  ) {
    national = digits.slice(TZ_COUNTRY_CODE.length);
  } else if (digits.startsWith('0')) {
    national = digits.slice(1);
  } else {
    national = digits;
  }

  if (national.length < TZ_NATIONAL_LENGTH) return { ok: false, reason: 'too_short' };
  if (national.length > TZ_NATIONAL_LENGTH) return { ok: false, reason: 'too_long' };
  if (national.startsWith('0')) return { ok: false, reason: 'invalid_prefix' };

  const e164 = `+${TZ_COUNTRY_CODE}${national}`;
  if (!E164_TZ.test(e164)) return { ok: false, reason: 'invalid_prefix' };
  return { ok: true, e164, national };
}

export function isE164Tz(value: string): boolean {
  return E164_TZ.test(value);
}

/** "+255754123456" → "+255 754 123 456" for display. Non-TZ or malformed values are returned unchanged. */
export function formatPhone(e164: string): string {
  if (!isE164Tz(e164)) return e164;
  const n = e164.slice(4);
  return `+255 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
}

/** "+255754123456" → "+25575****456". Use in logs and audit payloads; never log a full number. */
export function maskPhone(e164: string): string {
  if (!isE164Tz(e164)) return '***';
  return `${e164.slice(0, 6)}****${e164.slice(-3)}`;
}
