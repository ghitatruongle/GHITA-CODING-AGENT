// Extracted from EcosystemView (v0.1.5) — original JSX preserved
import type { RouterRoute } from './routerRoutes';

type Props = {
  t: (key: string, params?: Record<string, string | number>) => string;
  routerRoutes: RouterRoute[];
  maxCostThreshold: number;
  setMaxCostThreshold: (v: number) => void;
  complexityBoundary: string;
  setComplexityBoundary: (v: string) => void;
  toggleRouteStatus: (index: number) => void;
};

export function RouterPanel(props: Props) {
  const {
    t,
    routerRoutes,
    maxCostThreshold,
    setMaxCostThreshold,
    complexityBoundary,
    setComplexityBoundary,
    toggleRouteStatus,
  } = props;
  return (
    <>
      {/* Module 3: Dynamic Router & Provider Cost Optimizer */}
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-accent)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {t('ecosystem.dynamicRouter')}
          </span>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
            {t('ecosystem.autoOptimize')}
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          {t('ecosystem.dynamicRouterDesc')}
        </p>

        {/* Configurations inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            background: 'var(--bg-surface)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {t('ecosystem.maxCostPerTask')}
            </label>
            <input
              type="number"
              step="0.001"
              value={maxCostThreshold}
              onChange={(e) => setMaxCostThreshold(parseFloat(e.target.value) || 0.05)}
              style={{
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                // ACCESSIBILITY (audit fix 1.3): removed outline:none
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {t('ecosystem.complexityRouting')}
            </label>
            <select
              value={complexityBoundary}
              onChange={(e) => setComplexityBoundary(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary)',
                // ACCESSIBILITY (audit fix 1.3): removed outline:none
              }}
            >
              <option value="automatic">{t('ecosystem.automaticRouting')}</option>
              <option value="low-cost-forced">{t('ecosystem.forcedLowCost')}</option>
              <option value="high-performance-forced">{t('ecosystem.forcedHighQuality')}</option>
            </select>
          </div>
        </div>

        {/* Router Table */}
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '11px',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  color: 'var(--text-muted)',
                }}
              >
                <th style={{ padding: '8px' }}>{t('ecosystem.provider')}</th>
                <th style={{ padding: '8px' }}>{t('ecosystem.modelName')}</th>
                <th style={{ padding: '8px' }}>{t('ecosystem.mappedComplexity')}</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>{t('ecosystem.costPer1k')}</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>{t('ecosystem.avgLatency')}</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>
                  {t('ecosystem.routingState')}
                </th>
              </tr>
            </thead>
            <tbody>
              {routerRoutes.map((route, index) => (
                <tr
                  key={index}
                  style={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    background: index % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background =
                      index % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent')
                  }
                >
                  <td
                    style={{
                      padding: '10px 8px',
                      fontWeight: 600,
                      color: 'var(--text-accent)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {route.provider}
                  </td>
                  <td style={{ padding: '10px 8px', fontFamily: 'monospace' }}>{route.model}</td>
                  <td style={{ padding: '10px 8px' }}>
                    <span
                      style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                        fontSize: '9px',
                        background:
                          route.complexity === 'simple'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : route.complexity === 'medium'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(139, 92, 246, 0.15)',
                        color:
                          route.complexity === 'simple'
                            ? '#34d399'
                            : route.complexity === 'medium'
                              ? '#fbbf24'
                              : '#c084fc',
                      }}
                    >
                      {route.complexity.toUpperCase()}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 8px',
                      textAlign: 'right',
                      fontFamily: 'monospace',
                      color: '#fbbf24',
                    }}
                  >
                    ${route.costPer1kToken.toFixed(6)}
                  </td>
                  <td
                    style={{
                      padding: '10px 8px',
                      textAlign: 'right',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {route.latencyMs} ms
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleRouteStatus(index)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '9px',
                        fontWeight: 700,
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background:
                          route.status === 'active'
                            ? 'rgba(16, 185, 129, 0.2)'
                            : route.status === 'backup'
                              ? 'rgba(59, 130, 246, 0.2)'
                              : 'rgba(239, 68, 68, 0.2)',
                        color:
                          route.status === 'active'
                            ? '#34d399'
                            : route.status === 'backup'
                              ? '#60a5fa'
                              : '#f87171',
                      }}
                    >
                      {route.status.toUpperCase()}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
