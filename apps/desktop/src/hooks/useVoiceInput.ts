// Voice Input hook — Web Speech API with graceful fallback

import { useEffect, useRef, useState, useCallback } from 'react';

export type VoiceSupport = 'supported' | 'webkit-only' | 'unsupported';

interface SpeechRecognitionAlternative {
  transcript: string;
}
interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

export interface VoiceInput {
  listening: boolean;
  transcript: string;
  error: string | null;
  support: VoiceSupport;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

export function detectVoiceSupport(): VoiceSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const w = window as unknown as {
    SpeechRecognition?: new () => RecognitionLike;
    webkitSpeechRecognition?: new () => RecognitionLike;
  };
  if (w.SpeechRecognition) return 'supported';
  if (w.webkitSpeechRecognition) return 'webkit-only';
  return 'unsupported';
}

export function useVoiceInput(lang = 'en-US'): VoiceInput {
  const support = useRef(detectVoiceSupport()).current;
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    if (support === 'unsupported') {
      setError('Speech recognition not supported in this environment');
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;

    const rec: RecognitionLike = new Ctor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      setTranscript(text);
    };
    rec.onerror = (e) => {
      setError(e.error ?? 'unknown');
      setListening(false);
    };
    rec.onend = () => setListening(false);

    recognitionRef.current = rec;

    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    };
  }, [lang, support]);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setError(null);
    setTranscript('');
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      setListening(false);
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { listening, transcript, error, support, start, stop, reset };
}
