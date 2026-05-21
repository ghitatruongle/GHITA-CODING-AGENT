import { vi } from 'vitest';

export const mockSocketOnHandlers = new Map<string, (...args: any[]) => void>();
export const mockSocketEmit = vi.fn();
export const mockSocketOn = vi.fn((event: string, handler: (...args: any[]) => void) => {
  mockSocketOnHandlers.set(event, handler);
  return mockSocket;
});
export const mockSocket: any = {
  id: 'test-socket-1',
  on: mockSocketOn,
  emit: mockSocketEmit,
  join: vi.fn().mockImplementation(() => Promise.resolve()),
};
export const mockIoSocketOn = vi.fn();
export const mockIoEmit = vi.fn();
export const mockIoOn = vi.fn((event: string, handler: (socket: any) => void) => {
  if (event === 'connection') {
    mockIoSocketOn.mockImplementation(() => {});
    mockIoSocketOn.mockImplementation((_event: string, cb: (s: any) => void) => {
      cb(mockSocket);
    });
    handler(mockSocket);
  }
});
export const mockIo: any = {
  on: mockIoOn,
  emit: mockIoEmit,
  disconnectSockets: vi.fn(),
  close: vi.fn(),
  to: vi.fn().mockImplementation(() => ({
    emit: mockIoEmit,
  })),
};

export class Server {
  constructor() {
    return mockIo;
  }
}
