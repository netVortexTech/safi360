import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { initI18n } from '@/i18n';
import { initSentry } from '@/lib/sentry';
import '@/styles/globals.css';

initI18n('sw');
void initSentry();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
