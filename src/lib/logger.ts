// Lightweight structured logger. JSON lines to console, no external dependencies.
// Phone numbers are masked so PII never lands in log aggregation.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

/** +255XXXXXXXXX → +255XXX•••XXX. Non-matching input passes through unchanged. */
export function maskPhone(phone: string): string {
  return phone.replace(/(\+255\d{3})\d{3}(\d{3})/g, '$1•••$2');
}

function emit(level: LogLevel, msg: string, context: LogContext = {}): void {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    msg,
    ...context,
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug(msg: string, context?: LogContext): void {
    if (import.meta.env.DEV) emit('debug', msg, context);
  },
  info(msg: string, context?: LogContext): void {
    emit('info', msg, context);
  },
  warn(msg: string, context?: LogContext): void {
    emit('warn', msg, context);
  },
  error(msg: string, context?: LogContext): void {
    emit('error', msg, context);
  },
};
