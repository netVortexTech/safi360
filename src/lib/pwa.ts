/**
 * Registers the field-app service worker. Only the /field experience calls this, and
 * only in production builds; the ops portal and customer portal are never installable.
 */
export async function registerFieldServiceWorker(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({ immediate: true });
}
