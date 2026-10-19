import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, useMutation } from '@tanstack/react-query';
import { makeQueryClient } from '@/lib/query-client';
import { ToastProvider } from '@/components/ui/toast';
import { MutationErrorToasts } from './MutationErrorToasts';

function FailingMutation({ handled }: { handled?: boolean }) {
  const mutation = useMutation({
    mutationFn: () => Promise.reject(new Error('boom')),
    ...(handled ? { onError: () => undefined } : {}),
  });
  return <button onClick={() => mutation.mutate()}>go</button>;
}

function renderWith(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>
        <MutationErrorToasts />
        {ui}
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('<MutationErrorToasts>', () => {
  it('toasts a translated error when a mutation fails unhandled', async () => {
    renderWith(<FailingMutation />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    });
  });

  it('stays quiet when the screen handles the error itself', async () => {
    renderWith(<FailingMutation handled />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
