// ==============================================================================
// GHITA CODING AGENT — Ecosystem & Integration Settings (Phase 5 Dashboard)
// ==============================================================================

import { useState, useEffect } from 'react';

interface RouterRoute {
  provider: string;
  model: string;
  complexity: 'simple' | 'medium' | 'high';
  costPer1kToken: number; // in USD
  latencyMs: number;
  status: 'active' | 'backup' | 'disabled';
}

const INITIAL_ROUTER_ROUTES: RouterRoute[] = [
  { provider: 'ollama', model: 'llama3:8b (Local)', complexity: 'simple', costPer1kToken: 0.0000, latencyMs: 80, status: 'active' },
  { provider: 'google', model: 'gemini-1.5-flash', complexity: 'simple', costPer1kToken: 0.000075, latencyMs: 220, status: 'active' },
  { provider: 'openai', model: 'gpt-4o-mini', complexity: 'medium', costPer1kToken: 0.00015, latencyMs: 380, status: 'active' },
  { provider: 'anthropic', model: 'claude-3-5-sonnet', complexity: 'high', costPer1kToken: 0.0030, latencyMs: 740, status: 'active' },
  { provider: 'openai', model: 'gpt-4o', complexity: 'high', costPer1kToken: 0.0050, latencyMs: 690, status: 'backup' },
];

export function EcosystemView() {
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
  const [apRequests, setApRequests] = useState<Array<{ id: string; method: string; path: string; status: number; time: string }>>([
    { id: 'ap-req-1', method: 'POST', path: '/api/v1/agent/tasks', status: 201, time: '17:40:12' },
    { id: 'ap-req-2', method: 'GET', path: '/api/v1/agent/tasks/task-9382', status: 200, time: '17:40:15' },
    { id: 'ap-req-3', method: 'POST', path: '/api/v1/agent/tasks/task-9382/steps', status: 200, time: '17:41:02' },
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
        const randomLog = logTemplates[Math.floor(Math.random() * logTemplates.length)]!;
        setGrpcLogs((prev) => [...prev.slice(-30), `[${new Date().toLocaleTimeString()}] ${randomLog}`]);
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
        const method = methods[Math.floor(Math.random() * methods.length)]!;
        const path = paths[Math.floor(Math.random() * paths.length)]!;
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
      })
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
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(16px)',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        gap: '20px',
      }}
      className="custom-scrollbar"
    >
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
          📡 ECOSYSTEM & EXTERNAL CORE INTEGRATION
        </h2>
        <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
          Quản lý cổng truyền thông gRPC, API Agent Protocol chuẩn hóa và bộ định tuyến tối ưu hóa chi phí LLMs.
        </p>
      </div>

      {/* Grid container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '20px',
        }}
      >
        {/* Module 1: gRPC sidecar Server */}
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
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#c7d2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🤖 gRPC DAEMON CORE SERVER
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                background: grpcActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: grpcActive ? '#34d399' : '#f87171',
                border: `1px solid ${grpcActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {grpcActive ? '● RUNNING' : '○ STOPPED'}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
            Kênh giao tiếp nhị phân hiệu năng cao dành cho VS Code extension, CLI tool, và sidecar agents kết nối với GHITA Core.
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>SERVER PORT:</label>
              <input
                type="number"
                value={grpcPort}
                onChange={(e) => setGrpcPort(parseInt(e.target.value) || 50051)}
                disabled={grpcActive}
                style={{
                  padding: '8px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#f8fafc',
                  outline: 'none',
                  opacity: grpcActive ? 0.6 : 1,
                }}
              />
            </div>

            <button
              onClick={() => {
                setGrpcActive(!grpcActive);
                setGrpcLogs((prev) => [
                  ...prev,
                  `[gRPC] Server status toggled manually to: ${!grpcActive ? 'RUNNING' : 'STOPPED'}`
                ]);
              }}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                background: grpcActive ? '#ef4444' : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 10px rgba(99, 102, 241, 0.2)',
              }}
            >
              {grpcActive ? 'Stop Daemon' : 'Start Daemon'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>DAEMON LIVE CONSOLE:</span>
            <div
              style={{
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '10px',
                height: '140px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '10px',
                color: '#a5b4fc',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
              className="custom-scrollbar"
            >
              {grpcLogs.map((log, i) => (
                <div key={i} style={{ lineBreak: 'anywhere' }}>{log}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Module 2: Agent Protocol (AP) REST API */}
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
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#c7d2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔌 AGENT PROTOCOL ENDPOINTS (REST API)
            </span>
            <span
              style={{
                fontSize: '10px',
                padding: '3px 8px',
                borderRadius: '6px',
                fontWeight: 600,
                background: apActive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: apActive ? '#34d399' : '#f87171',
                border: `1px solid ${apActive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              }}
            >
              {apActive ? '● COMPLIANT' : '○ DISABLED'}
            </span>
          </div>

          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
            Tuân thủ tuyệt đối chuẩn hóa quốc tế <strong>Agent Protocol</strong> (tạo tasks, chạy steps, trích xuất files).
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <label style={{ fontSize: '10px', color: '#94a3b8' }}>API PORT:</label>
              <input
                type="number"
                value={apPort}
                onChange={(e) => setApPort(parseInt(e.target.value) || 8000)}
                disabled={apActive}
                style={{
                  padding: '8px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#f8fafc',
                  outline: 'none',
                  opacity: apActive ? 0.6 : 1,
                }}
              />
            </div>

            <button
              onClick={() => setApActive(!apActive)}
              style={{
                alignSelf: 'flex-end',
                padding: '8px 16px',
                fontSize: '11px',
                fontWeight: 700,
                borderRadius: '6px',
                border: 'none',
                background: apActive ? '#ef4444' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)',
              }}
            >
              {apActive ? 'Disable AP' : 'Enable AP'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>INCOMING REQUESTS MONITOR:</span>
            <div
              style={{
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px',
                padding: '10px',
                height: '140px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
              className="custom-scrollbar"
            >
              {apRequests.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '11px', color: '#64748b' }}>
                  No active REST request logs.
                </div>
              ) : (
                apRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '10px',
                      fontFamily: 'monospace',
                      borderBottom: '1px solid rgba(255,255,255,0.02)',
                      paddingBottom: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <span style={{
                        color: req.method === 'POST' ? '#34d399' : '#60a5fa',
                        fontWeight: 'bold',
                        width: '40px',
                      }}>
                        {req.method}
                      </span>
                      <span style={{ color: '#cbd5e1' }}>{req.path}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span style={{ color: req.status === 200 || req.status === 201 ? '#34d399' : '#f87171' }}>
                        {req.status}
                      </span>
                      <span style={{ color: '#64748b' }}>{req.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

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
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#c7d2fe', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🧠 DYNAMIC LLM COST & COMPLEXITY ROUTER
          </span>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 600 }}>
            💰 Auto-optimize token costs
          </span>
        </div>

        <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', lineHeight: '1.4' }}>
          Thuật toán tự động đo độ phức tạp của Prompt/Nhiệm vụ để ánh xạ nhà cung cấp tối ưu. Các tác vụ dễ (như gõ shell đơn giản) được chuyển tới Ollama nội bộ hoặc Gemini Flash giá rẻ, các tác vụ cực khó (như phân tích cấu trúc đa tệp) được định tuyến tới Claude 3.5 Sonnet.
        </p>

        {/* Configurations inputs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '14px',
            background: 'rgba(15, 23, 42, 0.3)',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.03)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#94a3b8' }}>MAX ALLOWED COST PER TASK ($):</label>
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
                color: '#cbd5e1',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#94a3b8' }}>COMPLEXITY BOUNDARY ROUTING:</label>
            <select
              value={complexityBoundary}
              onChange={(e) => setComplexityBoundary(e.target.value)}
              style={{
                padding: '6px 8px',
                fontSize: '12px',
                borderRadius: '6px',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#cbd5e1',
                outline: 'none',
              }}
            >
              <option value="automatic">Automatic Routing (Recommend)</option>
              <option value="low-cost-forced">Forced Local/Low Cost</option>
              <option value="high-performance-forced">Forced High Quality</option>
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
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                <th style={{ padding: '8px' }}>PROVIDER</th>
                <th style={{ padding: '8px' }}>MODEL NAME</th>
                <th style={{ padding: '8px' }}>MAPPED COMPLEXITY</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>COST / 1K TOKENS</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>AVG LATENCY</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>ROUTING STATE</th>
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
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(99, 102, 241, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255, 255, 255, 0.01)' : 'transparent'}
                >
                  <td style={{ padding: '10px 8px', fontWeight: 600, color: '#c7d2fe', textTransform: 'uppercase' }}>
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
                  <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#fbbf24' }}>
                    ${route.costPer1kToken.toFixed(6)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right', color: '#cbd5e1' }}>
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
    </div>
  );
}
