import type { CSSProperties } from 'react';

/** Parse "#RRGGBB" into "r g b" channels for the --brand variable. Returns null when invalid. */
export function hexToChannels(hex: string | undefined): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1] ?? '', 16);
  return `${(v >> 16) & 255} ${(v >> 8) & 255} ${v & 255}`;
}

/** WCAG relative luminance from channels; used to pick a readable foreground. */
export function luminance(channels: string): number {
  const [r = 0, g = 0, b = 0] = channels.split(' ').map((c) => {
    const s = Number(c) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const WHITE = '255 255 255';
const NAVY = '19 41 61'; // --navy token
const NAVY_LUMINANCE = luminance(NAVY);

/** WCAG contrast ratio between two luminances. */
function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Inline style that sets --brand for a tenant. Falls back to the primary teal when the
 * colour is missing or would not reach 4.5:1 against either white or navy text.
 */
export function brandStyle(brandHex: string | undefined): CSSProperties | undefined {
  const channels = hexToChannels(brandHex);
  if (!channels) return undefined;
  const lum = luminance(channels);
  const onWhite = contrast(lum, 1);
  const onDark = contrast(lum, NAVY_LUMINANCE);
  if (onWhite >= 4.5) {
    return { '--brand': channels, '--brand-foreground': WHITE } as CSSProperties;
  }
  if (onDark >= 4.5) {
    return { '--brand': channels, '--brand-foreground': NAVY } as CSSProperties;
  }
  return undefined; // keep the accessible fallback
}
