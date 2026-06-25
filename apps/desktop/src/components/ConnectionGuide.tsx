import { useTranslation } from '../i18n';

export function ConnectionGuide() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
      }}
    >
      <h3
        style={{
          fontSize: '14px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: '12px',
        }}
      >
        {t('devices.connectionGuide')}
      </h3>
      <ol
        style={{
          color: 'var(--text-secondary)',
          fontSize: '13px',
          lineHeight: 1.8,
          paddingLeft: '20px',
        }}
      >
        <li>{t('devices.guideStep1')}</li>
        <li>{t('devices.guideStep2')}</li>
        <li>{t('devices.guideStep3')}</li>
        <li>{t('devices.guideStep4')}</li>
        <li>{t('devices.guideStep5')}</li>
      </ol>
    </div>
  );
}
