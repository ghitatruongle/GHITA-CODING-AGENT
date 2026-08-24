// Voice Input Button — mic toggle with live transcript

import { useEffect } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useVoiceInput } from '../hooks/useVoiceInput';

export function VoiceInputButton({ onResult }: { onResult: (text: string) => void }) {
  const { t } = useTranslation();
  const { listening, transcript, error, support, start, stop, reset } = useVoiceInput();

  // Fire onResult when listening ends with a transcript
  useEffect(() => {
    if (!listening && transcript) {
      onResult(transcript);
      reset();
    }
  }, [listening, transcript, onResult, reset]);

  if (support === 'unsupported') {
    return (
      <button
        type="button"
        disabled
        aria-label={t('voice.unsupported')}
        title={t('voice.unsupportedHint')}
        style={{
          padding: '6px 10px',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          color: 'var(--text-muted)',
          cursor: 'not-allowed',
          fontSize: '12px',
        }}
      >
        <AlertCircle size={14} />
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-label={listening ? t('voice.stop') : t('voice.start')}
        aria-pressed={listening}
        style={{
          padding: '6px 10px',
          background: listening ? 'rgba(239,68,68,0.15)' : 'transparent',
          border: `1px solid ${listening ? '#ef4444' : 'var(--border-subtle)'}`,
          borderRadius: '6px',
          color: listening ? '#ef4444' : 'var(--text-primary)',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {listening ? <MicOff size={14} /> : <Mic size={14} />}
        {listening ? t('voice.listening') : t('voice.start')}
      </button>
      {listening && transcript && (
        <span
          aria-live="polite"
          style={{
            fontSize: '11px',
            color: 'var(--text-secondary)',
            fontStyle: 'italic',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {transcript}
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: '11px', color: '#ef4444' }}>
          {error}
        </span>
      )}
    </div>
  );
}
