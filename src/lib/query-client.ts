import { QueryClient } from '@tanstack/react-query';

/**
 * Query defaults shared by every experience:
 *  - no retry on 4xx (the user must act), up to 2 retries on network/5xx
 *  - data is considered fresh for 30 s so navigating back does not refetch immediately
 */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          const status = (error as { status?: number } | null)?.status;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: 0 },
    },
  });
}
