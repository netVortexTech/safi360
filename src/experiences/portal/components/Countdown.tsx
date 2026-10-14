import { useEffect, useState } from 'react';
import { formatRemaining } from '../util';

export interface CountdownProps {
  /** ISO instant the countdown ends. */
  until: string;
  onExpire?: (() => void) | undefined;
  /** Receives "mm:ss" (or "0:00" after expiry). */
  render: (text: string, expired: boolean) => React.ReactNode;
}

/** Slot hold countdown; ticks once a second and tells the parent when it hits zero. */
export function Countdown({ until, onExpire, render }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  const end = Date.parse(until);
  const expired = now >= end;

  useEffect(() => {
    if (expired) {
      onExpire?.();
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expired, onExpire]);

  return <>{render(formatRemaining(end - now), expired)}</>;
}
