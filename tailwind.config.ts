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
        border: rgb('border'),
        input: rgb('border'),
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
        // ui-spec type scale
        display: ['1.875rem', { lineHeight: '2.25rem', fontWeight: '600' }], // 30px
        h1: ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }], // 24px
        h2: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }], // 20px
        h3: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }], // 18px
        body: ['1rem', { lineHeight: '1.5rem' }], // 16px (mobile minimum)
        small: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }], // 12px
      },
      borderRadius: {
        DEFAULT: '0.5rem', // 8px — buttons, inputs
        md: '0.5rem',
        lg: '0.75rem', // 12px — cards, dialogs
        xl: '1rem', // 16px — bottom sheets
        full: '9999px', // badges
      },
      spacing: {
        // 4px base scale is Tailwind's default; add touch targets
        touch: '2.75rem', // 44px — ops/portal minimum target
        'touch-field': '3.5rem', // 56px — field app minimum target
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        sheet: '0 -8px 24px -8px rgb(15 23 42 / 0.2)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        // Indeterminate bar: the child is one third of the track, so 400% of its own
        // width carries it fully across and off the right edge.
        progress: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(400%)' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        progress: 'progress 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
