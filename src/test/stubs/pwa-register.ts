// Vitest stand-in for vite-plugin-pwa's virtual module.
export function registerSW(_options?: unknown): (reloadPage?: boolean) => Promise<void> {
  return () => Promise.resolve();
}
