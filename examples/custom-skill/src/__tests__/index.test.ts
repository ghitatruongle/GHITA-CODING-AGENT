import { describe, it, expect } from 'vitest';
import { weatherSkill } from '../index.js';

describe('weatherSkill', () => {
  it('should have correct metadata', () => {
    expect(weatherSkill.name).toBe('weather');
    expect(weatherSkill.version).toBe('1.0.0');
  });

  it('should execute with location', async () => {
    const result = await weatherSkill.execute({ location: 'Hanoi' });
    expect(result).toEqual({
      location: 'Hanoi',
      temperature: 22,
      condition: 'sunny',
    });
  });
});
