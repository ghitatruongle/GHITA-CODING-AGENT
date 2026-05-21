// ==============================================================================
// GHITA CODING AGENT — Visual Workflow Builder View (Phase 5 Ecosystem & Canvas)
// ==============================================================================

import { useState, useRef } from 'react';

interface WorkflowNode {
  id: string;
  type: 'start' | 'tool' | 'command' | 'condition' | 'loop' | 'end';
  title: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface WorkflowConnection {
  fromId: string;
  toId: string;
  fromPort: 'output' | 'yes' | 'no';
  toPort: 'input';
}

const DEFAULT_NODES: WorkflowNode[] = [
  {
    id: 'node-start',
    type: 'start',
    title: '🏁 Start Pipeline',
    x: 60,
    y: 180,
    config: { trigger: 'Git Push Event' },
  },
  {
    id: 'node-test',
    type: 'command',
    title: '💻 Run Unit Tests',
    x: 240,
    y: 180,
    config: { command: 'pnpm test --passWithNoTests' },
  },
  {
    id: 'node-check',
    type: 'condition',
    title: '❓ Tests Passed?',
    x: 430,
    y: 170,
    config: { condition: 'exitCode === 0' },
  },
  {
    id: 'node-deploy',
    type: 'tool',
    title: '🚀 Deploy to Vercel',
    x: 640,
    y: 70,
    config: { tool: 'vercel-deploy', environment: 'production' },
  },
  {
    id: 'node-fix',
    type: 'tool',
    title: '🛠️ Trigger AI Auto-Fix',
    x: 640,
    y: 280,
    config: { prompt: 'Fix the failed tests in sandbox environment' },
  },
];

const DEFAULT_CONNECTIONS: WorkflowConnection[] = [
  { fromId: 'node-start', toId: 'node-test', fromPort: 'output', toPort: 'input' },
  { fromId: 'node-test', toId: 'node-check', fromPort: 'output', toPort: 'input' },
  { fromId: 'node-check', toId: 'node-deploy', fromPort: 'yes', toPort: 'input' },
  { fromId: 'node-check', toId: 'node-fix', fromPort: 'no', toPort: 'input' },
];

export function WorkflowView() {
  const [nodes, setNodes] = useState<WorkflowNode[]>(DEFAULT_NODES);
  const [connections, setConnections] = useState<WorkflowConnection[]>(DEFAULT_CONNECTIONS);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  // Dragging node variables
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Link draft state
  const [linkingFrom, setLinkingFrom] = useState<{ nodeId: string; port: 'output' | 'yes' | 'no' } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleNodeMouseDown = (e: React.MouseEvent, node: WorkflowNode) => {
    if (linkingFrom) return; // Ignore drag if connecting ports
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    
    // Calculate mouse click offset relative to node top-left
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragOffsetRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.stopPropagation();
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();

    if (draggingNodeId) {
      // Scale coordinates relative to canvas scroll
      const x = Math.max(10, Math.min(2000, e.clientX - canvasRect.left - dragOffsetRef.current.x));
      const y = Math.max(10, Math.min(1000, e.clientY - canvasRect.top - dragOffsetRef.current.y));

      setNodes((prev) =>
        prev.map((n) => (n.id === draggingNodeId ? { ...n, x, y } : n))
      );
    }

    if (linkingFrom) {
      setMousePos({
        x: e.clientX - canvasRect.left,
        y: e.clientY - canvasRect.top,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingNodeId(null);
  };

  // Drag over/drop for side-bar node creation
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const type = e.dataTransfer.getData('nodeType') as WorkflowNode['type'];
    if (!type) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(10, e.clientX - canvasRect.left - 80);
    const y = Math.max(10, e.clientY - canvasRect.top - 24);
    
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type,
      title: getPlaceholderTitle(type),
      x,
      y,
      config: getDefaultConfig(type),
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  };

  const getPlaceholderTitle = (type: WorkflowNode['type']) => {
    switch (type) {
      case 'start': return '🏁 Start Trigger';
      case 'tool': return '🔌 Call Tool';
      case 'command': return '💻 Exec Command';
      case 'condition': return '❓ Condition Check';
      case 'loop': return '🔄 Repeat Loop';
      case 'end': return '🎯 Finish Flow';
    }
  };

  const getDefaultConfig = (type: WorkflowNode['type']): Record<string, string> => {
    switch (type) {
      case 'start': return { trigger: 'Manual Run' };
      case 'tool': return { tool: 'file-writer', target: 'index.ts' };
      case 'command': return { command: 'npm run lint' };
      case 'condition': return { condition: 'success === true' };
      case 'loop': return { maxIterations: '5' };
      case 'end': return { message: 'Successfully Completed' };
    }
  };

  // Add node via double click
  const handleCanvasDoubleClick = (e: React.MouseEvent) => {
    if (e.target !== canvasRef.current) return;
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - canvasRect.left - 80;
    const y = e.clientY - canvasRect.top - 24;

    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'command',
      title: '💻 New Exec Step',
      x,
      y,
      config: { command: 'echo "hello"' },
    };

    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  };

  // Link handle drag start
  const handleStartLink = (e: React.MouseEvent, nodeId: string, port: 'output' | 'yes' | 'no') => {
    e.stopPropagation();
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    setLinkingFrom({ nodeId, port });
    setMousePos({
      x: e.clientX - canvasRect.left,
      y: e.clientY - canvasRect.top,
    });
  };

  // Link target drop
  const handleConnect = (e: React.MouseEvent, toNodeId: string) => {
    e.stopPropagation();
    if (!linkingFrom) return;

    if (linkingFrom.nodeId !== toNodeId) {
      // Clear duplicate connections from same output port
      setConnections((prev) =>
        prev
          .filter((c) => !(c.fromId === linkingFrom.nodeId && c.fromPort === linkingFrom.port))
          .concat({
            fromId: linkingFrom.nodeId,
            toId: toNodeId,
            fromPort: linkingFrom.port,
            toPort: 'input',
          })
      );
    }
    setLinkingFrom(null);
  };

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.fromId !== nodeId && c.toId !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const clearCanvas = () => {
    setNodes([]);
    setConnections([]);
    setSelectedNodeId(null);
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Generate full JSON schema representing workflow
  const compileWorkflowJSON = () => {
    const data = {
      name: 'GHITA Custom Pipeline',
      compiledAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        config: n.config,
      })),
      edges: connections.map((c) => ({
        source: c.fromId,
        target: c.toId,
        route: c.fromPort,
      })),
    };
    return JSON.stringify(data, null, 2);
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(16px)',
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Visual canvas dragging CSS helper */}
      <style dangerouslySetInnerHTML={{ __html: `
        .canvas-grid {
          background-size: 24px 24px;
          background-image: 
            linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
        }
        .canvas-node {
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .canvas-node:hover {
          border-color: rgba(99, 102, 241, 0.4);
        }
        .canvas-node.selected {
          border-color: #6366f1;
          box-shadow: 0 0 14px rgba(99, 102, 241, 0.3);
        }
        .node-port {
          width: 10px;
          height: 10px;
          background: #6366f1;
          border-radius: 50%;
          border: 2px solid #0f172a;
          cursor: crosshair;
          transition: transform 0.1s;
        }
        .node-port:hover {
          transform: scale(1.4);
        }
      `}} />

      {/* Sidebar Tool Drawer */}
      <div
        style={{
          width: '240px',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(30, 41, 59, 0.4)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px', color: '#c7d2fe' }}>
            🧩 DRAG ACTION NODES
          </h3>
          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
            Kéo các node vào canvas để tự thiết kế pipeline tự động hóa.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(['start', 'command', 'tool', 'condition', 'loop', 'end'] as const).map((type) => (
            <div
              key={type}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('nodeType', type)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: '12px',
                fontWeight: 600,
                color: '#e2e8f0',
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'background 0.2s, border-color 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(15, 23, 42, 0.5)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
              }}
            >
              <span>
                {type === 'start' && '🏁'}
                {type === 'command' && '💻'}
                {type === 'tool' && '🔌'}
                {type === 'condition' && '❓'}
                {type === 'loop' && '🔄'}
                {type === 'end' && '🎯'}
              </span>
              <span>
                {type === 'start' && 'Start Trigger'}
                {type === 'command' && 'Run Command'}
                {type === 'tool' && 'Call MCP Tool'}
                {type === 'condition' && 'Conditional Check'}
                {type === 'loop' && 'Repeat Loop'}
                {type === 'end' && 'End Node'}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={() => {
              setNodes(DEFAULT_NODES);
              setConnections(DEFAULT_CONNECTIONS);
              setSelectedNodeId(null);
            }}
            style={{
              padding: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#a5b4fc',
              background: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            🔄 Reset Default Demo
          </button>
          <button
            onClick={clearCanvas}
            style={{
              padding: '8px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#f87171',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            🗑️ Clear Canvas
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Canvas Toolbar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            background: 'rgba(30, 41, 59, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🎨</span>
            <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>
              VISUAL ACTIONS CANVAS
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
              Double click canvas to add cmd node
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 600 }}>
              Active Steps: {nodes.length}
            </span>
            <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>
              Connections: {connections.length}
            </span>
          </div>
        </div>

        {/* Scrollable grid canvas container */}
        <div
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onDoubleClick={handleCanvasDoubleClick}
          className="canvas-grid"
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
            background: '#090d16',
          }}
        >
          {/* SVG Connector lines */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '2000px',
              height: '1000px',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          >
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#818cf8" />
              </marker>
            </defs>

            {/* Render completed connections */}
            {connections.map((c, index) => {
              const fromNode = nodes.find((n) => n.id === c.fromId);
              const toNode = nodes.find((n) => n.id === c.toId);
              if (!fromNode || !toNode) return null;

              // Output anchor point: Right-middle of fromNode
              const fromWidth = 160;
              const fromHeight = fromNode.type === 'condition' ? 76 : 58;
              let outX = fromNode.x + fromWidth;
              let outY = fromNode.y + fromHeight / 2;

              if (fromNode.type === 'condition') {
                if (c.fromPort === 'yes') {
                  outY = fromNode.y + 24;
                } else if (c.fromPort === 'no') {
                  outY = fromNode.y + 52;
                }
              }

              // Input anchor point: Left-middle of toNode
              const inX = toNode.x;
              const toHeight = toNode.type === 'condition' ? 76 : 58;
              const inY = toNode.y + toHeight / 2;

              // Cubic bezier control point offsets
              const dx = Math.abs(inX - outX) * 0.4;
              const pathStr = `M ${outX} ${outY} C ${outX + dx} ${outY}, ${inX - dx} ${inY}, ${inX} ${inY}`;

              return (
                <path
                  key={index}
                  d={pathStr}
                  fill="none"
                  stroke={c.fromPort === 'no' ? '#f43f5e' : c.fromPort === 'yes' ? '#10b981' : '#818cf8'}
                  strokeWidth="2"
                  markerEnd="url(#arrow)"
                  style={{ opacity: 0.85 }}
                />
              );
            })}

            {/* Render live link drafting */}
            {linkingFrom && (() => {
              const fromNode = nodes.find((n) => n.id === linkingFrom.nodeId);
              if (!fromNode) return null;

              const fromWidth = 160;
              const fromHeight = fromNode.type === 'condition' ? 76 : 58;
              let outX = fromNode.x + fromWidth;
              let outY = fromNode.y + fromHeight / 2;

              if (fromNode.type === 'condition') {
                if (linkingFrom.port === 'yes') {
                  outY = fromNode.y + 24;
                } else if (linkingFrom.port === 'no') {
                  outY = fromNode.y + 52;
                }
              }

              const dx = Math.abs(mousePos.x - outX) * 0.4;
              const pathStr = `M ${outX} ${outY} C ${outX + dx} ${outY}, ${mousePos.x - dx} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`;

              return (
                <path
                  d={pathStr}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              );
            })()}
          </svg>

          {/* Render workflow nodes */}
          {nodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isCondition = node.type === 'condition';
            
            return (
              <div
                key={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => {
                  setSelectedNodeId(node.id);
                  e.stopPropagation();
                }}
                className={`canvas-node ${isSelected ? 'selected' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: '160px',
                  zIndex: 10,
                  cursor: 'move',
                  userSelect: 'none',
                }}
              >
                {/* Drag Header */}
                <div
                  style={{
                    padding: '8px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderRadius: '8px 8px 0 0',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {node.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                    style={{
                      border: 'none',
                      background: 'none',
                      color: 'rgba(248, 113, 113, 0.6)',
                      fontSize: '10px',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(248, 113, 113, 0.6)'}
                  >
                    ✕
                  </button>
                </div>

                {/* Node details */}
                <div style={{ padding: '8px 10px', fontSize: '10px', color: '#94a3b8' }}>
                  {node.type === 'start' && 'Trigger: ' + (node.config.trigger || '')}
                  {node.type === 'command' && 'CMD: ' + (node.config.command || '')}
                  {node.type === 'tool' && 'Tool: ' + (node.config.tool || '')}
                  {node.type === 'condition' && 'IF: ' + (node.config.condition || '')}
                  {node.type === 'loop' && 'Loops: ' + (node.config.maxIterations || '5')}
                  {node.type === 'end' && 'Msg: ' + (node.config.message || '')}
                </div>

                {/* Left Input Port */}
                {node.type !== 'start' && (
                  <div
                    onMouseUp={(e) => handleConnect(e, node.id)}
                    className="node-port"
                    style={{
                      position: 'absolute',
                      left: '-6px',
                      top: isCondition ? '33px' : '24px',
                    }}
                    title="Connect target input"
                  />
                )}

                {/* Right Output Ports */}
                {isCondition ? (
                  <>
                    {/* YES Output */}
                    <div
                      onMouseDown={(e) => handleStartLink(e, node.id, 'yes')}
                      className="node-port"
                      style={{
                        position: 'absolute',
                        right: '-6px',
                        top: '19px',
                        background: '#10b981',
                      }}
                      title="Branch: YES"
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '15px', fontSize: '8px', color: '#10b981', fontWeight: 600 }}>YES</span>

                    {/* NO Output */}
                    <div
                      onMouseDown={(e) => handleStartLink(e, node.id, 'no')}
                      className="node-port"
                      style={{
                        position: 'absolute',
                        right: '-6px',
                        top: '47px',
                        background: '#f43f5e',
                      }}
                      title="Branch: NO"
                    />
                    <span style={{ position: 'absolute', right: '8px', top: '43px', fontSize: '8px', color: '#f43f5e', fontWeight: 600 }}>NO</span>
                  </>
                ) : (
                  node.type !== 'end' && (
                    <div
                      onMouseDown={(e) => handleStartLink(e, node.id, 'output')}
                      className="node-port"
                      style={{
                        position: 'absolute',
                        right: '-6px',
                        top: '24px',
                      }}
                      title="Connect next step"
                    />
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration Sidebar Panel */}
      <div
        style={{
          width: '280px',
          borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(30, 41, 59, 0.4)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#c7d2fe', letterSpacing: '0.5px' }}>
          ⚙️ CONFIGURATION PANEL
        </h3>

        {selectedNode ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: '#94a3b8' }}>Step Title:</label>
              <input
                type="text"
                value={selectedNode.title}
                onChange={(e) => {
                  const val = e.target.value;
                  setNodes((prev) => prev.map((n) => (n.id === selectedNode.id ? { ...n, title: val } : n)));
                }}
                style={{
                  padding: '8px 10px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#f8fafc',
                  outline: 'none',
                }}
              />
            </div>

            {/* Render dynamic settings depending on Node type */}
            {Object.keys(selectedNode.config).map((key) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'capitalize' }}>
                  {key}:
                </label>
                <input
                  type="text"
                  value={selectedNode.config[key] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id
                          ? { ...n, config: { ...n.config, [key]: val } }
                          : n
                      )
                    );
                  }}
                  style={{
                    padding: '8px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#f8fafc',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            ))}

            <div
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                fontSize: '11px',
                color: '#a5b4fc',
              }}
            >
              💡 <strong>Tip:</strong> Bạn có thể kết nối cổng ra của node này với cổng vào của node tiếp theo bằng cách click-drag chấm tròn màu xanh.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px', textAlign: 'center' }}>
            Chọn một action node trên canvas để tinh chỉnh tham số cấu hình.
          </div>
        )}

        {/* JSON Code Compile Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '16px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>COMPILED JSON PREVIEW:</span>
          <pre
            style={{
              margin: 0,
              padding: '10px',
              borderRadius: '8px',
              background: '#090d16',
              border: '1px solid rgba(255,255,255,0.05)',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: '#38bdf8',
              maxHeight: '160px',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {compileWorkflowJSON()}
          </pre>
        </div>
      </div>
    </div>
  );
}
