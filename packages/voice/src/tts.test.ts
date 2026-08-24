import { describe, it, expect, vi } from 'vitest';
import { TextToSpeech, SilentTtsProvider } from './tts.js';

describe('SilentTtsProvider', () => {
  const provider = new SilentTtsProvider();

  it('should list voices', async () => {
    const voices = await provider.listVoices();
    expect(voices).toContain('silent-default');
  });

  it('should synthesize silent audio', async () => {
    const result = await provider.synthesize({ text: 'Hello', voice: 'default' });
    expect(result.provider).toBe('silent');
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.audio.data.byteLength).toBeGreaterThan(0);
  });

  it('should scale duration with text length', async () => {
    const short = await provider.synthesize({ text: 'Hi', voice: 'default' });
    const long = await provider.synthesize({
      text: 'Hello World, this is a longer text',
      voice: 'default',
    });
    expect(long.durationMs).toBeGreaterThan(short.durationMs);
  });
});

describe('TextToSpeech', () => {
  let tts: TextToSpeech;

  beforeEach(() => {
    tts = new TextToSpeech();
  });

  it('should register and use a provider', async () => {
    tts.registerProvider(new SilentTtsProvider());
    const result = await tts.speak({ text: 'Hello', voice: 'default' });
    expect(result.provider).toBe('silent');
  });

  it('should set default provider', () => {
    const p1 = new SilentTtsProvider();
    const p2 = new SilentTtsProvider();
    tts.registerProvider(p1);
    tts.registerProvider(p2);
    tts.setDefault('silent');
    // should not throw
  });

  it('should throw for unknown default provider', () => {
    expect(() => tts.setDefault('unknown')).toThrow('Unknown provider');
  });

  it('should throw if no provider registered', async () => {
    await expect(tts.speak({ text: 'Hello', voice: 'default' })).rejects.toThrow('No TTS provider');
  });

  it('should list voices from all providers', async () => {
    tts.registerProvider(new SilentTtsProvider());
    const voices = await tts.listVoices();
    expect(voices.length).toBeGreaterThan(0);
  });

  it('should notify listeners', async () => {
    const listener = vi.fn();
    tts.registerProvider(new SilentTtsProvider());
    tts.onResult(listener);
    await tts.speak({ text: 'Hello', voice: 'default' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
