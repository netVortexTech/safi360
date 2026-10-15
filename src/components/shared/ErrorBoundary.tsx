import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Catches render errors below it and shows a generic message with a retry button. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(): void {
    // Intentionally not logging the error detail: avoids leaking PII into consoles.
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          className="rounded-lg border border-border bg-surface p-6 text-center"
          data-testid="error-boundary"
        >
          <h2 className="text-h2">Something went wrong</h2>
          <p className="mt-2 text-sm text-text-muted">
            Please try again. If the problem persists, contact support.
          </p>
          <button
            type="button"
            onClick={this.retry}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
