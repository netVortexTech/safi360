import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Every colour resolves to a CSS variable declared in src/styles/globals.css.
// Components never see a hex value; they use these token names.
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1400px' } },
    extend: {
      colors: {
        // brand
        primary: {
          DEFAULT: rgb('primary'),
          hover: rgb('primary-hover'),
          light: rgb('primary-light'),
          foreground: rgb('primary-foreground'),
        },
        navy: { DEFAULT: rgb('navy'), foreground: rgb('navy-foreground') },
        amber: { DEFAULT: rgb('amber'), foreground: rgb('amber-foreground') },
        // tenant brand: applied only to portal header / primary buttons and field header
        brand: { DEFAULT: rgb('brand'), foreground: rgb('brand-foreground') },
        // semantic (each has a tint for badges/banners and a dark text tone)
        success: { DEFAULT: rgb('success'), tint: rgb('success-tint'), text: rgb('success-text') },
        warning: { DEFAULT: rgb('warning'), tint: rgb('warning-tint'), text: rgb('warning-text') },
        error: { DEFAULT: rgb('error'), tint: rgb('error-tint'), text: rgb('error-text') },
        info: { DEFAULT: rgb('info'), tint: rgb('info-tint'), text: rgb('info-text') },
        // neutrals
        text: { DEFAULT: rgb('text'), muted: rgb('text-muted'), subtle: rgb('text-subtle') },
        border: { DEFAULT: rgb('border'), strong: rgb('border-strong') },
        input: rgb('border-strong'),
        ring: rgb('primary'),
        surface: { DEFAULT: rgb('surface'), muted: rgb('surface-muted'), page: rgb('surface-page') },
        background: rgb('surface-page'),
        foreground: rgb('text'),
        // shadcn compatibility aliases
        card: { DEFAULT: rgb('surface'), foreground: rgb('text') },
        popover: { DEFAULT: rgb('surface'), foreground: rgb('text') },
        muted: { DEFAULT: rgb('surface-muted'), foreground: rgb('text-muted') },
        accent: { DEFAULT: rgb('primary-light'), foreground: rgb('primary') },
        destructive: { DEFAULT: rgb('error'), foreground: rgb('primary-foreground') },
        secondary: { DEFAULT: rgb('surface-muted'), foreground: rgb('text') },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Type scale: tight, confident headings; generous, readable body.
        hero: [
          'clamp(2.25rem, 5.5vw, 3.5rem)',
          { lineHeight: '1.04', fontWeight: '600', letterSpacing: '-0.03em' },
        ],
        display: ['1.875rem', { lineHeight: '2.15rem', fontWeight: '600', letterSpacing: '-0.02em' }], // 30px
        h1: ['1.5rem', { lineHeight: '1.95rem', fontWeight: '600', letterSpacing: '-0.017em' }], // 24px
        h2: ['1.25rem', { lineHeight: '1.65rem', fontWeight: '600', letterSpacing: '-0.012em' }], // 20px
        h3: ['1.0625rem', { lineHeight: '1.45rem', fontWeight: '600', letterSpacing: '-0.006em' }], // 17px
        body: ['1rem', { lineHeight: '1.5rem' }], // 16px (mobile minimum)
        small: ['0.8125rem', { lineHeight: '1.15rem' }], // 13px
        caption: ['0.75rem', { lineHeight: '1rem', fontWeight: '500', letterSpacing: '0.01em' }], // 12px
      },
      letterSpacing: {
        eyebrow: '0.08em',
      },
      borderRadius: {
        DEFAULT: '0.625rem', // 10px — buttons, inputs
        sm: '0.375rem',
        md: '0.5rem',
        lg: '0.875rem', // 14px — panels, list rows
        xl: '1.25rem', // 20px — cards, dialogs
        '2xl': '1.5rem',
        full: '9999px', // badges
      },
      spacing: {
        // 4px base scale is Tailwind's default; add touch targets
        touch: '2.75rem', // 44px — ops/portal minimum target
        'touch-field': '3.5rem', // 56px — field app minimum target
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
        card: '0 1px 2px -1px rgb(16 24 40 / 0.06), 0 1px 3px 0 rgb(16 24 40 / 0.04)',
        lifted: '0 12px 28px -14px rgb(16 24 40 / 0.20), 0 2px 6px -3px rgb(16 24 40 / 0.06)',
        sheet: '0 -12px 32px -14px rgb(16 24 40 / 0.24)',
        overlay: '0 28px 70px -28px rgb(16 24 40 / 0.34), 0 10px 28px -16px rgb(16 24 40 / 0.16)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        premium: '320ms',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-up': 'fade-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) both',
        'fade-in': 'fade-in 0.3s ease-out both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
