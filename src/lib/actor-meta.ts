import { useAuth } from '@/lib/auth';

/**
 * Explicit staff actor for the write path, in the same shape the Edge Functions
 * send (`staff:<uuid>` + tenant role). Databases with correct JWT-claim wiring
 * ignore it (claims win); it keeps attribution and role checks working where
 * the claims do not reach the RPC.
 */
export function useActorMeta(): Record<string, unknown> {
  const { userId, claims } = useAuth();
  if (!userId || !claims.tenant_role) return {};
  return { actor: `staff:${userId}`, actor_role: claims.tenant_role };
}
