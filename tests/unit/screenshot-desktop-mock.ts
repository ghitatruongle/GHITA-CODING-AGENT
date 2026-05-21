import { vi } from 'vitest';

const mockScreenshot = vi.fn().mockResolvedValue(Buffer.from('fake-screenshot-data'));

export default mockScreenshot;
