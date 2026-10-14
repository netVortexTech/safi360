import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readClaims, supabase, type Safi360Claims } from '@/lib/supabase';

export type AuthStatus = 'loading' | 'signed_out' | 'signed_in';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  userId: string | null;
  claims: Safi360Claims;
}

export interface AuthApi extends AuthState {
  signOut: () => Promise<void>;
}

const EMPTY_CLAIMS: Safi360Claims = { tenant_id: null, tenant_role: null, is_super_admin: false };

const AuthContext = createContext<AuthApi | null>(null);

function stateFrom(session: Session | null): AuthState {
  return {
    status: session ? 'signed_in' : 'signed_out',
    session,
    userId: session?.user.id ?? null,
    claims: readClaims(session?.access_token),
  };
}

export interface AuthProviderProps {
  children: ReactNode;
  /** Tests inject a ready state instead of talking to Supabase. */
  initialState?: AuthState | undefined;
}

/** Tracks the Supabase session and the custom claims the access-token hook adds to it. */
export function AuthProvider({ children, initialState }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(
    initialState ?? { status: 'loading', session: null, userId: null, claims: EMPTY_CLAIMS },
  );

  useEffect(() => {
    if (initialState) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState(stateFrom(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setState(stateFrom(session));
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [initialState]);

  const api = useMemo<AuthApi>(
    () => ({
      ...state,
      signOut: async () => {
        await supabase.auth.signOut();
        setState(stateFrom(null));
      },
    }),
    [state],
  );

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
