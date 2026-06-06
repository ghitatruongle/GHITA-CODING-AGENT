// @vitest-environment happy-dom
// ==============================================================================
// GHITA CODING AGENT — ErrorFallback Unit Tests
// ==============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock the i18n module
const tMock = vi.fn((key: string, params?: Record<string, string | number>) => {
  const translations: Record<string, string> = {
    'errorFallback.title': 'An unexpected application error occurred',
    'errorFallback.retry': 'Reload User Interface',
    'errorFallback.maxRetriesReached': `Max retry attempts (${params?.attempts ?? 3}) reached. Please restart the application.`,
    'errorFallback.retryCount': `Attempt ${params?.current ?? 1} of ${params?.max ?? 3}`,
    'common.disabled': 'Disabled',
  };
  return translations[key] ?? key;
});

vi.mock('../i18n', () => ({
  useTranslation: () => ({ t: tMock }),
}));

import { ErrorFallback } from './ErrorFallback';

describe('ErrorFallback', () => {
  const mockResetErrorBoundary = vi.fn();
  const testError = new Error('Test error message');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the error alert role', () => {
    render(<ErrorFallback error={testError} resetErrorBoundary={mockResetErrorBoundary} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    render(<ErrorFallback error={testError} resetErrorBoundary={mockResetErrorBoundary} />);
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('displays the fallback title', () => {
    render(<ErrorFallback error={testError} resetErrorBoundary={mockResetErrorBoundary} />);
    expect(screen.getByText('An unexpected application error occurred')).toBeInTheDocument();
  });

  it('renders a retry button that calls resetErrorBoundary on click', () => {
    render(<ErrorFallback error={testError} resetErrorBoundary={mockResetErrorBoundary} />);

    const retryButton = screen.getByText('Reload User Interface');
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();

    fireEvent.click(retryButton);
    expect(mockResetErrorBoundary).toHaveBeenCalledTimes(1);
  });

  it('renders with correct structure', () => {
    const { container } = render(
      <ErrorFallback error={testError} resetErrorBoundary={mockResetErrorBoundary} />,
    );

    // Should have the warning emoji
    expect(container.textContent).toContain('⚠️');
    // Should have the error message in a pre tag
    expect(container.querySelector('pre')).toHaveTextContent('Test error message');
  });
});
