// ==============================================================================
// GHITA CODING AGENT — Ecosystem & Integration Settings (Phase 5 Dashboard)
// ==============================================================================

import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n';

import { INITIAL_ROUTER_ROUTES, type RouterRoute } from './ecosystem/routerRoutes';
import { RouterPanel } from './ecosystem/RouterPanel';
import { GrpcModuleCard } from './ecosystem/GrpcModuleCard';
import { ApModuleCard } from './ecosystem/ApModuleCard';

export function EcosystemView() {
  const { t } = useTranslation();

  // gRPC Server states
  const [grpcActive, setGrpcActive] = useState(true);
  const [grpcPort, setGrpcPort] = useState(50051);
  const [grpcLogs, setGrpcLogs] = useState<string[]>([
    '[gRPC] gRPC daemon started on port 50051.',
    '[gRPC] Registered GhitaService v1 protobuf schemas.',
    '[gRPC] Handshake request received from VS Code extension sidecar (PID: 9482).',
    '[gRPC] Connection authenticated successfully.',
  ]);

  // Agent Protocol states
  const [apActive, setApActive] = useState(true);
  const [apPort, setApPort] = useState(8000);
  const [apRequests, setApRequests] = useState<
    Array<{ id: string; method: string; path: string; status: number; time: string }>
  >([
    { id: 'ap-req-1', method: 'POST', path: '/api/v1/agent/tasks', status: 201, time: '17:40:12' },
    {
      id: 'ap-req-2',
      method: 'GET',
      path: '/api/v1/agent/tasks/task-9382',
      status: 200,
      time: '17:40:15',
    },
    {
      id: 'ap-req-3',
      method: 'POST',
      path: '/api/v1/agent/tasks/task-9382/steps',
      status: 200,
      time: '17:41:02',
    },
  ]);

  // Dynamic Router settings
  const [routerRoutes, setRouterRoutes] = useState<RouterRoute[]>(INITIAL_ROUTER_ROUTES);
  const [maxCostThreshold, setMaxCostThreshold] = useState(0.05); // USD
  const [complexityBoundary, setComplexityBoundary] = useState('automatic');

  // Simulator loop for live log feed & mock requests
  useEffect(() => {
    const interval = setInterval(() => {
      if (grpcActive) {
        // Mock gRPC activity logs
        const logTemplates = [
          `[gRPC] Client keep-alive ping received.`,
          `[gRPC] Querying workspace files for code intelligence.`,
          `[gRPC] Invoking remote procedure CallSubagent.`,
          `[gRPC] Stream channel heartbeats processed.`,
        ];
        const randomLog = logTemplates[Math.floor(Math.random() * logTemplates.length)] ?? '';
        setGrpcLogs((prev) => [
          ...prev.slice(-30),
          `[${new Date().toLocaleTimeString()}] ${randomLog}`,
        ]);
      }

      if (apActive && Math.random() > 0.6) {
        // Mock Agent Protocol requests
        const paths = [
          '/api/v1/agent/tasks',
          '/api/v1/agent/tasks/task-9382',
          '/api/v1/agent/tasks/task-9382/steps',
          '/api/v1/agent/tasks/task-9382/artifacts',
        ];
        const methods = ['GET', 'POST'];
        const method = methods[Math.floor(Math.random() * methods.length)] ?? 'GET';
        const path = paths[Math.floor(Math.random() * paths.length)] ?? '/';
        const status = Math.random() > 0.05 ? 200 : 404;

        setApRequests((prev) => [
          {
            id: `ap-req-${Date.now()}`,
            method,
            path,
            status,
            time: new Date().toLocaleTimeString(),
          },
          ...prev.slice(0, 14),
        ]);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [grpcActive, apActive]);

  const toggleRouteStatus = (index: number) => {
    setRouterRoutes((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const nextStatus: RouterRoute['status'] =
          r.status === 'active' ? 'backup' : r.status === 'backup' ? 'disabled' : 'active';
        return { ...r, status: nextStatus };
      }),
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '20px',
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        backdropFilter: 'blur(16px)',
        color: 'var(--text-primary)',
        fontFamily: 'system-ui, sans-serif',
        gap: '20px',
      }}
      className="custom-scrollbar"
    >
      {/* Demo Mode Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '8px',
          background: 'rgba(251, 191, 36, 0.12)',
          border: '1px solid rgba(251, 191, 36, 0.25)',
          fontSize: '11px',
          fontWeight: 600,
          color: '#fbbf24',
          letterSpacing: '0.3px',
        }}
      >
        <span style={{ fontSize: '13px' }}>⚠</span>
        {t('ecosystem.demoMode') || 'Demo Mode — Data is simulated'}
      </div>

      <div>
        <h2
          style={{
            margin: '0 0 6px 0',
            fontSize: '18px',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #a5b4fc 0%, #818cf8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.5px',
          }}
        >
          {t('ecosystem.title')}
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
          {t('ecosystem.subtitle')}
        </p>
      </div>

      {/* Grid container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}
      >
        <GrpcModuleCard
          t={t}
          grpcActive={grpcActive}
          setGrpcActive={setGrpcActive}
          grpcPort={grpcPort}
          setGrpcPort={setGrpcPort}
          grpcLogs={grpcLogs}
          setGrpcLogs={setGrpcLogs}
        />
        <ApModuleCard
          t={t}
          apActive={apActive}
          setApActive={setApActive}
          apPort={apPort}
          setApPort={setApPort}
          apRequests={apRequests}
        />
      </div>

      <RouterPanel
        t={t}
        routerRoutes={routerRoutes}
        maxCostThreshold={maxCostThreshold}
        setMaxCostThreshold={setMaxCostThreshold}
        complexityBoundary={complexityBoundary}
        setComplexityBoundary={setComplexityBoundary}
        toggleRouteStatus={toggleRouteStatus}
      />
    </div>
  );
}
