// ==============================================================================
// GHITA CODING AGENT - Mobile Screen Component Tests (Phase 19 Bonus)
// ==============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MobileScreen } from './MobileScreen.js';

// ----- Mock Tauri -----

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

beforeEach(() => {
  mockInvoke.mockReset();
  Object.defineProperty(window, '__TAURI__', {
    value: { core: { invoke: mockInvoke } },
    configurable: true,
  });
});

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
  vi.clearAllMocks();
});

// ----- Test 1: Renders with no device selected -----

describe('MobileScreen', () => {
  it('renders placeholder when no device selected', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<MobileScreen />);
    await waitFor(() => {
      expect(screen.getByText(/No device selected/i)).toBeTruthy();
    });
  });

  it('lists connected devices in dropdown', async () => {
    mockInvoke.mockResolvedValue([
      { serial: 'emulator-5554', state: 'device', product: 'Pixel 6' },
      { serial: 'ABC123', state: 'unauthorized' },
    ]);
    render(<MobileScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(/emulator-5554/).length).toBeGreaterThan(0);
    });
  });

  it('displays error when device list fails', async () => {
    // Mock invoke to throw
    mockInvoke.mockRejectedValue(new Error('adb not found'));
    render(<MobileScreen />);
    await waitFor(() => {
      expect(screen.getByText(/adb not found/i)).toBeTruthy();
    });
  });

  it('shows error banner that can be dismissed', async () => {
    mockInvoke.mockRejectedValue(new Error('adb error'));
    render(<MobileScreen />);
    await waitFor(() => {
      const dismissBtn = screen.getByText('×');
      expect(dismissBtn).toBeTruthy();
    });
    const dismissBtn = screen.getByText('×');
    fireEvent.click(dismissBtn);
    await waitFor(() => {
      expect(screen.queryByText('×')).toBeNull();
    });
  });

  it('renders with default refresh interval of 1000ms', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<MobileScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Refresh: 1000ms/)).toBeTruthy();
    });
  });

  it('respects custom refresh interval', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<MobileScreen refreshIntervalMs={500} />);
    await waitFor(() => {
      expect(screen.getByText(/Refresh: 500ms/)).toBeTruthy();
    });
  });

  it('disables touch when enableTouch=false', async () => {
    mockInvoke.mockResolvedValue([]);
    render(<MobileScreen enableTouch={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Touch: disabled/)).toBeTruthy();
    });
  });

  it('calls onTap callback when image clicked', async () => {
    mockInvoke.mockImplementation(async (cmd) => {
      if (cmd === 'mobile_adb_list_devices') return [{ serial: 'dev1', state: 'device' }];
      if (cmd === 'mobile_adb_screenshot') return 'data:image/png;base64,AAA';
      if (cmd === 'mobile_adb_tap') return undefined;
      return [];
    });

    const onTap = vi.fn();
    render(<MobileScreen onTap={onTap} refreshIntervalMs={999999} />);
    await waitFor(() => screen.getByAltText(/Mobile screen/));

    const img = screen.getByAltText(/Mobile screen/) as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 1080 });
    Object.defineProperty(img, 'naturalHeight', { value: 1920 });

    // Simulate click (tap detection)
    fireEvent.click(img, { clientX: 50, clientY: 100 });
    await waitFor(() => {
      expect(onTap).toHaveBeenCalled();
    });
  });

  it('handles Tauri runtime unavailable', async () => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
    render(<MobileScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Tauri runtime not available/i)).toBeTruthy();
    });
  });
});
