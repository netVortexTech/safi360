import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// One Vite app serves all four experiences. The PWA manifest is scoped to /field so
// that only the cleaner app is installable; the ops portal and customer portal stay
// ordinary web pages.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually inside the /field experience only
      manifest: {
        name: 'Safi360 Field',
        short_name: 'Safi360',
        description: 'Cleaner job app',
        start_url: '/field',
        scope: '/field',
        display: 'standalone',
        background_color: '#F8FAFC',
        theme_color: '#0E7C7B',
        lang: 'sw',
        // TODO(phase-5): replace with 192/512 PNG + maskable icons from the tenant branding step.
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackAllowlist: [/^\/field/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: false },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          // TODO(phase-1): add `supabase: ['@supabase/supabase-js']` once a screen imports
          // the client; until then Rollup emits (and warns about) an empty chunk.
        },
      },
    },
  },
});
