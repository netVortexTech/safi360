import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';
import { AuthProvider, type AuthState } from '@/lib/auth';
import { makeQueryClient } from '@/lib/query-client';

export interface AppProvidersProps {
  children: ReactNode;
  /** Tests: skip Supabase and start from a known auth state. */
  auth?: AuthState | undefined;
  queryClient?: QueryClient | undefined;
}

export function AppProviders({ children, auth, queryClient }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? makeQueryClient());
  return (
    <QueryClientProvider client={client}>
      <AuthProvider initialState={auth}>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
