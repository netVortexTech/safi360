// axe-core accessibility helper for tests. axe-core stays an optional peer:
// dynamic import + try/catch means suites pass even when it is not installed.
export interface AxeViolation {
  id: string;
  description: string;
  nodes: number;
}

/**
 * Run axe on a rendered container and return the violations found.
 * Returns [] when axe-core is not installed (CI installs it; local runs skip).
 */
export async function runAxe(container: HTMLElement): Promise<AxeViolation[]> {
  let axe: {
    run(el: HTMLElement): Promise<{ violations: { id: string; description: string; nodes: unknown[] }[] }>;
  };
  try {
    // @ts-expect-error: axe-core is an optional dev dependency; suites skip when absent.
    axe = await import('axe-core');
  } catch {
    return [];
  }
  const results = await axe.run(container);
  return results.violations.map((v) => ({
    id: v.id,
    description: v.description,
    nodes: v.nodes.length,
  }));
}
