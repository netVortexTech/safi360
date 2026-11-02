import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the auth API functions
vi.mock('@/lib/auth-api', () => ({
  signUpWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  requestOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  resendSignupCode: vi.fn(),
  authErrorKey: vi.fn((err) => err.message || 'auth.error'),
  MIN_PASSWORD_LENGTH: 6,
  SMS_AVAILABLE: true,
}));

// Mock the supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signIn: vi.fn(),
      verifyOtp: vi.fn(),
      resend: vi.fn(),
      refreshSession: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
    },
    rpc: vi.fn(),
  },
}));

// Mock navigation
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await import('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock AuthContext
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    status: 'signed_out',
    session: null,
    userId: null,
    claims: { tenant_id: null, tenant_role: null, is_super_admin: false },
    signOut: vi.fn(),
  }),
}));

// Import the component after mocking
import OnboardingSignup from '@/experiences/onboarding/pages/OnboardingSignup';

const createTestWrapper = () => {
  const queryClient = new QueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('OnboardingSignup Flow', () => {
  const testCredentials = {
    phone: '789136815',
    email: 'stewardbac45@gmail.com',
    password: 'Admin@360',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful signup response
    const { signUpWithPassword } = require('@/lib/auth-api');
    signUpWithPassword.mockResolvedValue({ needsCode: false });
    
    // Mock supabase auth signUp
    const { supabase } = require('@/lib/supabase');
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: testCredentials.email } },
      error: null,
    });
    
    // Mock session refresh
    supabase.auth.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    });
  });

  it('completes signup flow and redirects to plan page on success', async () => {
    const { signUpWithPassword } = require('@/lib/auth-api');
    signUpWithPassword.mockResolvedValue({ needsCode: false });
    
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    // Fill in the signup form
    const phoneInput = screen.getByLabelText('phone.label');
    const emailInput = screen.getByLabelText('auth.email_optional_label');
    const passwordInput = screen.getByLabelText('auth.password_label');
    const confirmPasswordInput = screen.getByLabelText('auth.password_confirm_label');
    const submitButton = screen.getByRole('button', { name: /create_account/i });
    
    fireEvent.change(phoneInput, { target: { value: testCredentials.phone } });
    fireEvent.change(emailInput, { target: { value: testCredentials.email } });
    fireEvent.change(passwordInput, { target: { value: testCredentials.password } });
    fireEvent.change(confirmPasswordInput, { target: { value: testCredentials.password } });
    
    // Submit the form
    fireEvent.click(submitButton);
    
    // Wait for the signup to complete
    await waitFor(() => {
      expect(signUpWithPassword).toHaveBeenCalledWith(
        testCredentials.phone,
        testCredentials.password,
        testCredentials.email
      );
    });
    
    // Should redirect to plan page after successful signup
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding/plan', { replace: true });
    });
  });

  it('shows loading state during signup and prevents multiple submissions', async () => {
    const { signUpWithPassword } = require('@/lib/auth-api');
    signUpWithPassword.mockImplementation(() => new Promise(() => {})); // Never resolves
    
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    const phoneInput = screen.getByLabelText('phone.label');
    const passwordInput = screen.getByLabelText('auth.password_label');
    const submitButton = screen.getByRole('button', { name: /create_account/i });
    
    // Fill in form
    fireEvent.change(phoneInput, { target: { value: testCredentials.phone } });
    fireEvent.change(passwordInput, { target: { value: testCredentials.password } });
    
    // Submit form
    fireEvent.click(submitButton);
    
    // Button should show loading state
    expect(screen.getByRole('button', { name: /creating_account/i })).toBeInTheDocument();
    
    // Button should be disabled while loading
    expect(submitButton).toBeDisabled();
  });

  it('handles signup error and shows error message', async () => {
    const { signUpWithPassword } = require('@/lib/auth-api');
    signUpWithPassword.mockRejectedValue(new Error('auth.errors.already_registered'));
    
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    const phoneInput = screen.getByLabelText('phone.label');
    const passwordInput = screen.getByLabelText('auth.password_label');
    const submitButton = screen.getByRole('button', { name: /create_account/i });
    
    // Fill in form
    fireEvent.change(phoneInput, { target: { value: testCredentials.phone } });
    fireEvent.change(passwordInput, { target: { value: testCredentials.password } });
    
    // Submit form
    fireEvent.click(submitButton);
    
    // Should show error message
    await waitFor(() => {
      expect(screen.getByText(/auth.errors.already_registered/i)).toBeInTheDocument();
    });
    
    // Should not redirect on error
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('validates form inputs before submission', async () => {
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    const phoneInput = screen.getByLabelText('phone.label');
    const passwordInput = screen.getByLabelText('auth.password_label');
    const confirmPasswordInput = screen.getByLabelText('auth.password_confirm_label');
    const submitButton = screen.getByRole('button', { name: /create_account/i });
    
    // Try to submit with empty phone
    fireEvent.change(passwordInput, { target: { value: testCredentials.password } });
    fireEvent.change(confirmPasswordInput, { target: { value: testCredentials.password } });
    fireEvent.click(submitButton);
    
    // Should not submit with empty phone
    expect(screen.getByText(/auth.errors.generic/i)).toBeInTheDocument();
  });

  it('handles SMS code verification when needsCode is true', async () => {
    const { signUpWithPassword } = require('@/lib/auth-api');
    const { verifyOtp } = require('@/lib/auth-api');
    
    // Mock signup that needs code
    signUpWithPassword.mockResolvedValue({ needsCode: true });
    verifyOtp.mockResolvedValue();
    
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    const phoneInput = screen.getByLabelText('phone.label');
    const passwordInput = screen.getByLabelText('auth.password_label');
    const submitButton = screen.getByRole('button', { name: /create_account/i });
    
    // Fill in form
    fireEvent.change(phoneInput, { target: { value: testCredentials.phone } });
    fireEvent.change(passwordInput, { target: { value: testCredentials.password } });
    
    // Submit form
    fireEvent.click(submitButton);
    
    // Should proceed to code verification step
    await waitFor(() => {
      expect(verifyOtp).toHaveBeenCalled();
    });
  });
});

describe('OnboardingPlan Flow', () => {
  it('redirects to plan page when user already has tenant claims', async () => {
    // Mock auth context with tenant claims
    vi.mock('@/lib/auth', () => ({
      useAuth: () => ({
        status: 'signed_in',
        session: { user: { id: 'test-user-id' } },
        userId: 'test-user-id',
        claims: { tenant_id: 'test-tenant-id', tenant_role: 'OWNER', is_super_admin: false },
        signOut: vi.fn(),
      }),
    }));
    
    const { useNavigate } = await import('react-router-dom');
    useNavigate.mockReturnValue(mockNavigate);
    
    render(<OnboardingSignup />, { wrapper: createTestWrapper() });
    
    // Should redirect to plan page when user has tenant claims
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding/plan', { replace: true });
  });
});