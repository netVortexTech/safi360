import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { applyExperienceLocale } from '@/i18n';
import { brandStyle } from '@/lib/brand';

/**
 * Customer portal shell (/:slug). Swahili by default; the tenant brand colour is applied
 * through the --brand CSS variable on this root only, never deeper.
 */
export function PortalLayout() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    applyExperienceLocale('sw');
  }, []);

  // Branding is loaded from the tenant in Phase 3; the fallback keeps the UI accessible.
  return (
    <div className="min-h-dvh bg-surface-page" style={brandStyle(undefined)} data-tenant={slug}>
      <header className="safe-top bg-brand text-brand-foreground">
        <div className="mx-auto flex h-14 max-w-2xl items-center px-4">
          <span className="text-base font-semibold">{slug}</span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
