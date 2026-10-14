// Structured logging for Edge Functions. Phone numbers are masked before they reach stdout.

const E164 = /\+255\d{9}/g;

export function maskPhones(value: string): string {
  return value.replace(E164, (m) => `${m.slice(0, 6)}****${m.slice(-3)}`);
}

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const safe = JSON.parse(maskPhones(JSON.stringify(fields))) as Record<string, unknown>;
  // Secrets never reach a log line: callers must not pass tokens or keys here.
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...safe });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
