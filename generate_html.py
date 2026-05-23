import json, os

path = 'D:/GHITA CODING AGENT/Plan/Update 0.0.2 beta2.html'

html = r'''<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phân Tích AI Frameworks & Kế Hoạch Tích Hợp - Update 0.0.2 Beta2</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.7}
  .container{max-width:1200px;margin:0 auto;padding:40px 24px}
  .header{text-align:center;padding:60px 0 40px;border-bottom:1px solid #1e1e2e;margin-bottom:48px}
  .header h1{font-size:2.8em;font-weight:800;background:linear-gradient(135deg,#60a5fa,#a78bfa,#f472b6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
  .header .subtitle{color:#888;font-size:1.1em;margin-top:12px}
  .version{display:inline-block;background:#1e1e2e;padding:6px 16px;border-radius:20px;font-size:0.85em;color:#60a5fa;margin-top:16px;border:1px solid #2e2e42}
  .date{color:#666;font-size:0.9em;margin-top:8px}
  .section{margin:48px 0;padding:32px;background:#0e0e16;border:1px solid #1e1e2e;border-radius:16px}
  .section h2{font-size:1.8em;font-weight:700;margin-bottom:24px;padding-bottom:12px;border-bottom:2px solid #1e1e2e;display:flex;align-items:center;gap:12px;color:#fff}
  .section h3{font-size:1.3em;font-weight:600;margin:24px 0 16px;color:#c0c0e0}
  .section h4{font-size:1.1em;font-weight:600;margin:18px 0 10px;color:#a0a0c0}
  .card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin:16px 0}
  .card{background:#12121a;border:1px solid #1e1e2e;border-radius:12px;padding:24px;transition:all 0.3s}
  .card:hover{border-color:#3e3e5e;transform:translateY(-2px)}
  .card .icon{font-size:2.2em;margin-bottom:10px}
  .card h4{margin:0 0 6px;font-size:1.15em;color:#fff}
  .card p{color:#888;font-size:0.88em}
  .tag{display:inline-block;padding:2px 10px;border-radius:10px;font-size:0.8em;font-weight:600}
  .tg-high{background:#1a2e1a;color:#48bb78}
  .tg-mid{background:#2e2a1a;color:#ecc94b}
  .tg-low{background:#1e1e2e;color:#666}
  .tg-imp{background:#3a1a1a;color:#fc8181}
  .tg-new{background:#1a1a3a;color:#60a5fa;animation:pulse 2s infinite}
  @keyframes pulse{0%{opacity:0.7}50%{opacity:1}100%{opacity:0.7}}
  .feat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;margin:12px 0}
  .feat-item{background:#16161f;padding:8px 12px;border-radius:6px;border:1px solid #1e1e2e;font-size:0.85em;display:flex;align-items:center;gap:6px}
  .feat-item:hover{border-color:#3e3e5e}
  .feat-item.new{background:#1a1a3a;border-left:3px solid #60a5fa}
  .dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .d-h{background:#48bb78}
  .d-m{background:#ecc94b}
  .d-l{background:#666}
  .d-new{background:#60a5fa}
  .prov-list{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}
  .prov-tag{padding:2px 8px;border-radius:4px;background:#1a1a2a;border:1px solid #2e2e42;font-size:0.78em;color:#999}
  .info-box{background:#1a1a2a;border:1px solid #2e2e42;border-radius:10px;padding:18px;margin:12px 0;border-left:3px solid #60a5fa}
  .info-box strong{color:#60a5fa}
  .info-box.new-box{border-left:3px solid #a78bfa}
  .info-box.new-box strong{color:#a78bfa}
  table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:0.85em}
  thead th{background:#12121a;padding:8px 12px;text-align:left;font-weight:600;color:#888;border-bottom:2px solid #1e1e2e;font-size:0.8em;text-transform:uppercase}
  tbody td{padding:8px 12px;border-bottom:1px solid #1a1a2a;color:#c0c0d0}
  tbody tr:hover td{background:#16161f}
  tbody tr.new-row td{background:#1a1a3a;border-left:2px solid #60a5fa}
  .phase-table{background:#12121a;border:1px solid #1e1e2e;border-radius:12px;padding:20px;margin:16px 0}
  .phase-table table{margin:0}
  .phase-header{display:flex;gap:12px;padding:12px 16px;border-radius:8px;margin:8px 0;color:#fff;font-weight:600;font-size:1em}
  .ph1{background:linear-gradient(135deg,#1e3a5f,#2d4a7f)}
  .ph2{background:linear-gradient(135deg,#2e3a2e,#3d5a3d)}
  .ph3{background:linear-gradient(135deg,#3e2a3e,#5d3a5d)}
  .ph4{background:linear-gradient(135deg,#3e2e1e,#5d4a2d)}
  .guide-step{padding:14px 18px;margin:8px 0;background:#16161f;border-radius:8px;border-left:3px solid #a78bfa}
  .guide-step .step-num{color:#a78bfa;font-weight:700;margin-right:8px}
  .footer{text-align:center;padding:40px 0;color:#555;font-size:0.85em;border-top:1px solid #1e1e2e;margin-top:60px}
  pre{background:#0a0a12;padding:12px 16px;border-radius:8px;border:1px solid #1e1e2e;overflow-x:auto;font-size:0.85em;color:#c0c0d0;margin:8px 0}
  code{color:#a78bfa}
  .summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin:16px 0}
  .summary-card{background:#12121a;border:1px solid #1e1e2e;border-radius:10px;padding:16px;text-align:center}
  .summary-card .num{font-size:2.2em;font-weight:800;color:#60a5fa}
  .summary-card .label{color:#888;font-size:0.82em;margin-top:4px}
  .expand-section{margin:8px 0}
  .expand-header{background:#16161f;padding:10px 14px;border-radius:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;border:1px solid #1e1e2e}
  .expand-header:hover{background:#1e1e2e}
  .expand-content{display:none;padding:12px 14px;border:1px solid #1e1e2e;border-top:none;border-radius:0 0 6px 6px}
  .new-badge{display:inline-block;background:#1a3a6a;color:#60a5fa;font-size:0.7em;padding:1px 6px;border-radius:3px;margin-left:4px;font-weight:600}
  @media(max-width:768px){.container{padding:24px 16px}.header h1{font-size:1.8em}.card-grid{grid-template-columns:1fr}}
  ::-webkit-scrollbar{width:8px}
  ::-webkit-scrollbar-track{background:#0a0a0f}
  ::-webkit-scrollbar-thumb{background:#2e2e42;border-radius:4px}
</style>
</head>
<body>
<div class="container">

<!-- HEADER -->
<div class="header">
  <h1>Phan Tich AI Frameworks &amp; Ke Hoach Tich Hop</h1>
  <div class="subtitle">Bao cao chi tiet cac tinh nang AI co the nhung vao phan mem</div>
  <div class="version">Update 0.0.2 Beta2</div>
  <div class="date">Ngay phan tich: 21/05/2026</div>
</div>

<!-- ====== MUC 1: TONG QUAN ====== -->
<div class="section">
  <h2>Muc 1: Tong Quan 4 Frameworks</h2>

  <div class="info-box">
    <strong>Muc tieu:</strong> Phan tich 4 AI framework hang dau de trich xuat cac tinh nang co the nhung vao phan mem. Phien ban nay <strong>bo sung them 57 tinh nang</strong> moi phat hien tu ma nguon thuc te.
  </div>

  <div class="card-grid">
    <div class="card" style="border-left:3px solid #60a5fa">
      <div class="icon">Vercel AI SDK</div>
      <span class="tag tg-blue">TypeScript</span>
      <p>AI SDK hien dai nhat voi unified API. 30+ providers, agent loop, middleware, UI adapters. <strong>35 tinh nang</strong> co the nhung.</p>
    </div>
    <div class="card" style="border-left:3px solid #48bb78">
      <div class="icon">LangChain.js</div>
      <span class="tag tg-high">TypeScript</span>
      <p>Framework LLM voi Runnable composable architecture. Pipeline, messages, prompts, storage. <strong>28 tinh nang</strong> co the nhung.</p>
    </div>
    <div class="card" style="border-left:3px solid #fc8181">
      <div class="icon">LiteLLM</div>
      <span class="tag tg-red">Python</span>
      <p>Enterprise AI infrastructure proxy: 100+ providers, router, caching, auth, guardrails, cost. <strong>40+ tinh nang</strong> co the nhung.</p>
    </div>
    <div class="card" style="border-left:3px solid #a78bfa">
      <div class="icon">CrewAI</div>
      <span class="tag tg-purple">Python</span>
      <p>Multi-agent orchestration: agents, tasks, knowledge, memory, A2A protocol. <strong>28 tinh nang</strong> co the nhung.</p>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card"><div class="num">131</div><div class="label">Tong tinh nang</div></div>
    <div class="summary-card"><div class="num">57</div><div class="label">Tinh nang bo sung (phien nay)</div></div>
    <div class="summary-card"><div class="num">4</div><div class="label">Framework phan tich</div></div>
    <div class="summary-card"><div class="num">~21</div><div class="label">Tuan du kien trien khai</div></div>
  </div>

  <h3>Bang So Sanh Nhanh (Mo rong)</h3>
  <table>
    <thead>
      <tr><th>Tieu chi</th><th>Vercel AI SDK</th><th>LangChain.js</th><th>LiteLLM</th><th>CrewAI</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Ngon ngu</strong></td><td>TypeScript</td><td>TypeScript</td><td>Python</td><td>Python</td></tr>
      <tr><td><strong>So providers</strong></td><td>30+</td><td>20+</td><td><strong>100+</strong></td><td>Qua LLM</td></tr>
      <tr><td><strong>Text Gen + Stream</strong></td><td>Co</td><td>Co</td><td>Co</td><td>Co</td></tr>
      <tr><td><strong>Structured Output</strong></td><td><strong>Noi bat</strong></td><td>Co</td><td>Co</td><td>Qua LLM</td></tr>
      <tr><td><strong>Agent System</strong></td><td>Tool loop + Approval</td><td>ReAct agent + Middleware</td><td>Qua proxy</td><td><strong>Chuyen sau</strong></td></tr>
      <tr><td><strong>Multi-Agent</strong></td><td>Khong</td><td>Khong</td><td>A2A Protocol</td><td><strong>Cot loi</strong></td></tr>
      <tr><td><strong>Workflow</strong></td><td><span class="tag tg-new">Moi</span></td><td>Khong</td><td>Container + Scheduler</td><td>Flow</td></tr>
      <tr><td><strong>MCP Support</strong></td><td>Co (dedicated package)</td><td>Co</td><td>Co (experimental)</td><td>Co</td></tr>
      <tr><td><strong>Embedding</strong></td><td>Co</td><td>Co</td><td>Co</td><td>Qua LLM</td></tr>
      <tr><td><strong>Image/Audio/Video</strong></td><td>Co</td><td>Khong</td><td>Co</td><td>Khong</td></tr>
      <tr><td><strong>RAG</strong></td><td>Trung binh</td><td>Co</td><td>Co</td><td>Co</td></tr>
      <tr><td><strong>Caching</strong></td><td>Khong</td><td>Co</td><td><strong>Nhieu loai</strong></td><td>Co</td></tr>
      <tr><td><strong>Auth + Rate Limit</strong></td><td>Khong</td><td>Khong</td><td><strong>Day du</strong></td><td>Co ban</td></tr>
      <tr><td><strong>Guardrails</strong></td><td>Trung binh (mid)</td><td>Khong</td><td><strong>Nhieu loai</strong></td><td>Co ban</td></tr>
      <tr><td><strong>Cost Tracking</strong></td><td>Khong</td><td>Khong</td><td><strong>Chi tiet</strong></td><td>Khong</td></tr>
      <tr><td><strong>Budget Mgmt</strong></td><td>Khong</td><td>Khong</td><td><strong>Day du</strong></td><td>Khong</td></tr>
      <tr><td><strong>Observability</strong></td><td>OTel + Telemetry</td><td>LangSmith</td><td><strong>30+ integrations</strong></td><td>OTel</td></tr>
      <tr><td><strong>Secret Detection</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi: 80+ patterns</span></td><td>Khong</td></tr>
      <tr><td><strong>Fine-tuning</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi</span></td><td>Khong</td></tr>
      <tr><td><strong>Batch Processing</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi</span></td><td>Khong</td></tr>
      <tr><td><strong>Real-time API</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi (WebSocket)</span></td><td>Khong</td></tr>
      <tr><td><strong>SSO</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi</span></td><td>Auth0, Okta...</td></tr>
      <tr><td><strong>Evals</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi</span></td><td>Khong</td></tr>
      <tr><td><strong>Alerting</strong></td><td>Khong</td><td>Khong</td><td><span class="tag tg-new">Moi</span></td><td>Khong</td></tr>
      <tr><td><strong>UI Framework</strong></td><td>React, Vue, Svelte, Angular</td><td>Khong</td><td>Admin Dashboard</td><td>Khong</td></tr>
      <tr><td><strong>Storage</strong></td><td>Khong</td><td>In-memory, File, Encoder</td><td>Nhieu loai</td><td>Khong</td></tr>
      <tr><td><strong>Hub/Prompt Mgmt</strong></td><td>Khong</td><td>LangChain Hub</td><td>Prompt Mgmt + Versioning</td><td>Khong</td></tr>
      <tr><td><strong>Deployment</strong></td><td>Khong</td><td>Khong</td><td>Docker, K8s, Helm, Terraform</td><td>Khong</td></tr>
      <tr><td><strong>Docker Support</strong></td><td>Khong</td><td>Khong</td><td>Co</td><td>Khong</td></tr>
    </tbody>
  </table>
  <p style="color:#666;font-size:0.8em"><span class="tag tg-new">Moi</span> = Tinh nang bo sung trong phien nay</p>
</div>

<!-- ====== MUC 2: NGHIEN CUU ====== -->
<div class="section">
  <h2>Muc 2: Nghien Cuu Chi Tiet Tung Framework</h2>

  <!-- 2.1 Vercel AI SDK -->
  <h3 style="color:#60a5fa">2.1 Vercel AI SDK</h3>
  <div class="info-box">
    <strong>Duong dan:</strong> <code>refer_project/ai-framework/vercel-ai/packages/</code><br>
    <strong>So packages:</strong> 56 (1 core AI + 55 providers/adapters/integrations)<br>
    <strong>Vai tro:</strong> Core AI engine + UI integration layer<br>
    <strong>Tinh nang moi bo sung:</strong> 14
  </div>

  <h4>Tinh nang chi tiet (35 tinh nang)</h4>
  <table>
    <thead><tr><th>Tinh nang</th><th>API/Module</th><th>Mo ta</th><th>Uu tien</th></tr></thead>
    <tbody>
      <tr><td>Text Generation</td><td><code>generateText()</code></td><td>Generate text voi full options: temperature, top_p, max_tokens, stop, frequency/penalty params</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Streaming Text</td><td><code>streamText()</code></td><td>Real-time streaming voi chunked callbacks, transforms</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Structured Output</td><td><code>generateObject()</code></td><td>Generate structured JSON voi Zod/json schema validation, text repair</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Stream Object</td><td><code>streamObject()</code></td><td>Stream structured objects voi ObjectStreamPart events</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Agent Loop</td><td><code>ToolLoopAgent</code></td><td>Iterative tool execution: decide-execute-observe-repeat. Configurable stop conditions</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr class="new-row"><td>Tool Approval</td><td><code>tool-approval-configuration.ts</code></td><td><span class="tag tg-new">Moi</span> Approval workflow cho tool execution, human-in-the-loop</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr class="new-row"><td>Tool Call Repair</td><td><code>tool-call-repair-function.ts</code></td><td><span class="tag tg-new">Moi</span> Tu dong sua loi khi tool call bi parse sai</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Tool Context</td><td><code>tools-context-parameter.ts</code></td><td><span class="tag tg-new">Moi</span> Context param cho tools, runtime context immutable</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Active Tools Filter</td><td><code>filter-active-tools.ts</code></td><td><span class="tag tg-new">Moi</span> Loc tools active theo step ma khong can thay doi types</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Agent UI Stream</td><td><code>createAgentUIStream()</code></td><td>Stream agent responses to UI, pipeAgentUIStreamToResponse()</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Embedding</td><td><code>embed()</code>, <code>embedMany()</code></td><td>Single & batch text embedding generation</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Image Generation</td><td><code>generateImage()</code></td><td>AI image generation voi GenerateImageResult</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Speech Generation</td><td><code>generate-speech/</code></td><td>Text-to-speech generation</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Video Generation</td><td><code>generate-video/</code></td><td>AI video generation</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Transcription</td><td><code>transcribe/</code></td><td>Audio-to-text transcription</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Reranking</td><td><code>rerank/</code></td><td>Search result reranking</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Middleware Pipeline</td><td><code>wrapLanguageModel()</code></td><td>Wrap models voi middleware: defaultSettings, extractJSON, extractReasoning, simulateStreaming, addToolInputExamples</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Mid: Embedding</td><td><code>wrapEmbeddingModel()</code></td><td><span class="tag tg-new">Moi</span> Middleware cho embedding models</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Mid: Image</td><td><code>wrapImageModel()</code></td><td><span class="tag tg-new">Moi</span> Middleware cho image generation models</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Provider Wrapper</td><td><code>wrapProvider()</code></td><td><span class="tag tg-new">Moi</span> Higher-level wrapper de apply middleware toan bo provider</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Model Registry</td><td><code>createProviderRegistry()</code></td><td>Central registry cho model providers, custom provider support</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Tool System</td><td><code>tool()</code>, <code>dynamicTool()</code></td><td>Typed tools voi Zod validation, static & dynamic tools, ToolSet</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Workflow System</td><td><code>workflow/package</code></td><td><span class="tag tg-new">Moi</span> WorkflowAgent, Output, lifecycle hooks (onStart, onFinish, onStepStart, onToolExecution...)</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>MCP Client</td><td><code>mcp/package</code></td><td><span class="tag tg-new">Moi</span> Model Context Protocol client: createMCPClient, OAuth auth, tools, resources</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Gateway API</td><td><code>gateway/package</code></td><td><span class="tag tg-new">Moi</span> Model management, spend reporting, generation insights, typed errors</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Provider Utils</td><td><code>provider-utils/package</code></td><td><span class="tag tg-new">Moi</span> Data conversion, networking, tool factories, API key management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Smooth Stream</td><td><code>smoothStream()</code></td><td><span class="tag tg-new">Moi</span> Smooth streaming voi ChunkDetector, delay/optimization</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Token Calculation</td><td><code>calculate-tokens-per-second.ts</code></td><td><span class="tag tg-new">Moi</span> Tinh toan token speed, optimize streaming performance</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Message Pruning</td><td><code>prune-messages.ts</code></td><td><span class="tag tg-new">Moi</span> Tu dong cat ngan context window de tranh exceed token limit</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Reasoning Extraction</td><td><code>extract-reasoning-content.ts</code></td><td><span class="tag tg-new">Moi</span> Trich xuat reasoning/chain-of-thought tu model output</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Lifecycle Events</td><td><code>GenerateText events</code></td><td>Start/End events, step events, tool execution events, model call events, callbacks</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Prompt System</td><td><code>prompt/</code></td><td>Instructions, Prompt types, message Zod schemas, timeout utilities</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Error Handling</td><td><code>error/</code></td><td>20+ specialized error classes</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>UI Adapters</td><td>React, Svelte, Vue, Angular, RSC</td><td>Framework-specific adapters cho real-time UI updates</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Telemetry</td><td><code>otel/</code> + <code>telemetry/</code></td><td><span class="tag tg-new">Moi</span> OpenTelemetry integration, registerTelemetry, diagnostic channel</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>DevTools</td><td><code>devtools/package</code></td><td><span class="tag tg-new">Moi</span> Developer tools, inspection, debugging utilities</td><td><span class="tag tg-low">Thap</span></td></tr>
    </tbody>
  </table>

  <h4>Tinh nang moi bo sung (14)</h4>
  <div class="feat-grid">
    <div class="feat-item new"><span class="dot d-new"></span> Tool Approval Workflow</div>
    <div class="feat-item new"><span class="dot d-new"></span> Tool Call Repair Function</div>
    <div class="feat-item new"><span class="dot d-new"></span> Tool Context Parameter</div>
    <div class="feat-item new"><span class="dot d-new"></span> Active Tools Filter</div>
    <div class="feat-item new"><span class="dot d-new"></span> Workflow System (WorkflowAgent)</div>
    <div class="feat-item new"><span class="dot d-new"></span> MCP Client (dedicated package)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Gateway API</div>
    <div class="feat-item new"><span class="dot d-new"></span> Provider Utils package</div>
    <div class="feat-item new"><span class="dot d-new"></span> Smooth Stream with ChunkDetector</div>
    <div class="feat-item new"><span class="dot d-new"></span> Token Calculation utilities</div>
    <div class="feat-item new"><span class="dot d-new"></span> Message Pruning</div>
    <div class="feat-item new"><span class="dot d-new"></span> Reasoning Content Extraction</div>
    <div class="feat-item new"><span class="dot d-new"></span> Telemetry + DevTools packages</div>
    <div class="feat-item new"><span class="dot d-new"></span> wrapEmbeddingModel + wrapImageModel</div>
  </div>

  <h4>Providers ho tro (30+)</h4>
  <div class="prov-list">
    <span class="prov-tag">OpenAI</span>
    <span class="prov-tag">Anthropic</span>
    <span class="prov-tag">Google</span>
    <span class="prov-tag">Google Vertex</span>
    <span class="prov-tag">Mistral</span>
    <span class="prov-tag">Cohere</span>
    <span class="prov-tag">Groq</span>
    <span class="prov-tag">DeepSeek</span>
    <span class="prov-tag">Azure</span>
    <span class="prov-tag">AWS Bedrock</span>
    <span class="prov-tag">Fireworks</span>
    <span class="prov-tag">Replicate</span>
    <span class="prov-tag">HuggingFace</span>
    <span class="prov-tag">Perplexity</span>
    <span class="prov-tag">Together AI</span>
    <span class="prov-tag">XAI</span>
    <span class="prov-tag">Cerebras</span>
    <span class="prov-tag">Deepgram</span>
    <span class="prov-tag">ElevenLabs</span>
    <span class="prov-tag">Voyage</span>
    <span class="prov-tag">Fal</span>
    <span class="prov-tag">Luma</span>
    <span class="prov-tag">Alibaba</span>
    <span class="prov-tag">Amazon</span>
    <span class="prov-tag">Baseten</span>
    <span class="prov-tag">Black Forest Labs</span>
    <span class="prov-tag">ByteDance</span>
    <span class="prov-tag">KlingAI</span>
    <span class="prov-tag">LMNT</span>
    <span class="prov-tag">Moonshot AI</span>
    <span class="prov-tag">OpenAI Responses</span>
    <span class="prov-tag">OpenAI Compatible</span>
    <span class="prov-tag">Prodia</span>
    <span class="prov-tag">Rev AI</span>
    <span class="prov-tag">AssemblyAI</span>
    <span class="prov-tag">Gladia</span>
    <span class="prov-tag">Hume</span>
  </div>

  <h4>Packages mo rong (moi phat hien)</h4>
  <div class="prov-list">
    <span class="prov-tag">workflow/</span>
    <span class="prov-tag">mcp/</span>
    <span class="prov-tag">gateway/</span>
    <span class="prov-tag">provider-utils/</span>
    <span class="prov-tag">provider/</span>
    <span class="prov-tag">otel/</span>
    <span class="prov-tag">devtools/</span>
    <span class="prov-tag">valibot/</span>
    <span class="prov-tag">codemod/</span>
    <span class="prov-tag">test-server/</span>
    <span class="prov-tag">langchain/ (bridge)</span>
    <span class="prov-tag">llamaindex/ (bridge)</span>
    <span class="prov-tag">open-responses/</span>
    <span class="prov-tag">rsc/</span>
  </div>

  <!-- 2.2 LangChain.js -->
  <h3 style="color:#48bb78">2.2 LangChain.js</h3>
  <div class="info-box">
    <strong>Duong dan:</strong> <code>refer_project/ai-framework/langchainjs/libs/</code><br>
    <strong>Cau truc:</strong> langchain-core (core), langchain (main), langchain-classic (legacy), providers<br>
    <strong>Vai tro:</strong> Pipeline composition & message processing layer<br>
    <strong>Tinh nang moi bo sung:</strong> 6
  </div>

  <h4>Tinh nang chi tiet (28 tinh nang)</h4>
  <table>
    <thead><tr><th>Tinh nang</th><th>Module</th><th>Mo ta</th><th>Uu tien</th></tr></thead>
    <tbody>
      <tr><td>Runnable System</td><td><code>Runnable</code></td><td>Abstract base class: invoke, batch, stream, transform. Generic unit of work voi name, retry, config binding</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Runnable Decorators</td><td><code>withRetry()</code></td><td>Retry logic voi so lan thu va error handling</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Config Binding</td><td><code>withConfig()</code></td><td>Bind configuration params, returns RunnableBinding</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Fallbacks</td><td><code>withFallbacks()</code></td><td>Define alternative runnables neu primary invocation fails</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Runnables Graph</td><td><code>runnables/graph.ts</code></td><td>Graph execution, Mermaid diagram generation</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Chat Models</td><td><code>BaseChatModel</code></td><td>Abstract base: generate, invoke, stream, tool binding, structured output, caching</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Simple Chat Model</td><td><code>SimpleChatModel</code></td><td>Subclass chi can implement _call(), tu dong wrap thanh AIMessage</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Universal Chat Model</td><td><code>chat_models/universal.ts</code></td><td><span class="tag tg-new">Moi</span> Model universal ho tro nhieu providers qua 1 API</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Messages System</td><td><code>messages/</code></td><td>Human, AI, System, Tool, Chat, Function messages. Content: text, image, tool calls, multimodal</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Block Translators</td><td><code>block_translators/</code></td><td>Chuan hoa message formats: Anthropic, OpenAI, Bedrock, Google, DeepSeek, Groq, Ollama, XAI</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Prompts</td><td><code>prompts/</code></td><td>Base, Chat, FewShot, Pipeline, Structured, String, Image, Dict, Template. Mustache template</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Output Parsers</td><td><code>output_parsers/</code></td><td>JSON, XML, List, String, Structured (Zod), Bytes, OpenAI parsers</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>ReAct Agent</td><td><code>agents/createAgent()</code></td><td><span class="tag tg-new">Moi</span> Production-ready ReAct agent: structured output, middleware, streaming, state management</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Agent Middleware</td><td><code>agents/middleware.ts</code></td><td><span class="tag tg-new">Moi</span> Extend agent behavior: pre/post model, human-in-the-loop, retries, dynamic flows</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Agent Types</td><td><code>agents/types.ts</code></td><td>AgentAction (tool+input), AgentFinish (final result), AgentStep (action+observation)</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Memory</td><td><code>memory.ts</code></td><td>Chat history management, context window management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Documents</td><td><code>documents/</code></td><td>Document class, loaders (base, LangSmith), transformers</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Vector Stores</td><td><code>vectorstores.ts</code></td><td>Vector store abstractions, retrievers, document compressors</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Embeddings</td><td><code>embeddings.ts</code></td><td>Embedding models integration</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Storage</td><td><code>storage/</code></td><td><span class="tag tg-new">Moi</span> InMemory, FileSystem, EncoderBacked storage backends</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Hub Integration</td><td><code>hub/</code></td><td><span class="tag tg-new">Moi</span> LangChain Hub: pull/push prompts, model binding, caching</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Callbacks & Tracing</td><td><code>callbacks/</code>, <code>tracers/</code></td><td>Callback manager, handlers (console, event stream, log stream, LangChain, LangSmith)</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Caching</td><td><code>caches/</code></td><td>Base cache, InMemoryCache</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Indexing</td><td><code>indexing/</code></td><td>Document indexing, record manager</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Structured Query</td><td><code>structured_query/</code></td><td>Query construction, IR, utilities</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Example Selectors</td><td><code>example_selectors/</code></td><td>Base, conditional, length-based, semantic similarity</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Testing Utils</td><td><code>testing/</code></td><td>Fake models, chat models, embeddings, retrievers, vector stores, matchers</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Serialization</td><td><code>load/</code></td><td>Serializable base, import maps, load/save utilities</td><td><span class="tag tg-low">Thap</span></td></tr>
    </tbody>
  </table>

  <h4>Tinh nang moi bo sung (6)</h4>
  <div class="feat-grid">
    <div class="feat-item new"><span class="dot d-new"></span> ReAct Agent (createAgent)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Agent Middleware System</div>
    <div class="feat-item new"><span class="dot d-new"></span> Universal Chat Model</div>
    <div class="feat-item new"><span class="dot d-new"></span> Storage Backends (3 loai)</div>
    <div class="feat-item new"><span class="dot d-new"></span> LangChain Hub Integration</div>
    <div class="feat-item new"><span class="dot d-new"></span> Headless Tools</div>
  </div>

  <!-- 2.3 LiteLLM -->
  <h3 style="color:#fc8181">2.3 LiteLLM</h3>
  <div class="info-box">
    <strong>Duong dan:</strong> <code>refer_project/ai-framework/litellm/litellm/</code><br>
    <strong>Phien ban:</strong> 1.79.1<br>
    <strong>Modules:</strong> 50+ modules chuyen biet + enterprise + UI dashboard<br>
    <strong>Vai tro:</strong> Enterprise AI infrastructure layer<br>
    <strong>Tinh nang moi bo sung:</strong> 20+
  </div>

  <h4>Tinh nang chi tiet (40+ tinh nang)</h4>
  <table>
    <thead><tr><th>Tinh nang</th><th>Module</th><th>Mo ta</th><th>Uu tien</th></tr></thead>
    <tbody>
      <tr><td>Unified Completion</td><td><code>completion()</code></td><td>1 API cho 100+ LLM providers. Chat completions, streaming, function calling</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Model Router</td><td><code>router.py</code></td><td>Router: load balancing, fallback, retries, cooldowns, queuing. Strategies: latency, cost, usage</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Streaming</td><td><code>main.py</code></td><td>Streaming support cho moi providers, real-time token delivery</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Function/Tool Calling</td><td><code>llms/</code></td><td>Parallel function calling, tool integration</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Embedding</td><td><code>main.py</code></td><td>Embedding generation qua unified API</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Image Gen</td><td><code>images/</code></td><td>Image generation: main.py, utils.py</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Audio/Speech</td><td><code>endpoints/speech/</code></td><td>Speech-to-text, text-to-speech bridge</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Fine-tuning API</td><td><code>fine_tuning/</code></td><td><span class="tag tg-new">Moi</span> Fine-tuning API cho custom models</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Assistants API</td><td><code>assistants/</code></td><td><span class="tag tg-new">Moi</span> OpenAI-compatible Assistants API</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Batches API</td><td><code>batches/</code></td><td><span class="tag tg-new">Moi</span> Batch processing, batch_utils</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Files API</td><td><code>files/</code></td><td><span class="tag tg-new">Moi</span> File management: upload, streaming, types, utils</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Real-time API</td><td><code>realtime_api/</code></td><td><span class="tag tg-new">Moi</span> WebSocket-based real-time API support</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Search API</td><td><code>search/</code></td><td><span class="tag tg-new">Moi</span> Search functionality</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>OCR Module</td><td><code>ocr/</code></td><td><span class="tag tg-new">Moi</span> Optical Character Recognition</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Videos Module</td><td><code>videos/</code></td><td><span class="tag tg-new">Moi</span> Video processing capabilities</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Evals Module</td><td><code>evals/</code></td><td><span class="tag tg-new">Moi</span> LLM evaluation framework</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Skills Plugin</td><td><code>skills/</code></td><td><span class="tag tg-new">Moi</span> AI skills/plugins management</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Passthrough</td><td><code>passthrough/</code></td><td><span class="tag tg-new">Moi</span> Request passthrough to custom endpoints</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Interactions</td><td><code>interactions/</code></td><td><span class="tag tg-new">Moi</span> User interaction tracking</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Scheduler</td><td><code>scheduler.py</code></td><td><span class="tag tg-new">Moi</span> Scheduled task management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Caching</td><td><code>caching/</code></td><td>Redis, Redis Cluster, Redis Semantic, In-Memory, Disk, S3, GCS, Azure Blob, Qdrant Semantic, Dual Cache, LRU</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Cost Calculation</td><td><code>cost_calculator.py</code></td><td>Token counting, cost tracking per model, cost.json, model_prices_and_context_window.json</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Rate Limiting</td><td><code>router.py</code></td><td>Per-user, per-key, per-model rate limiting. Cooldown management</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Authentication</td><td><code>proxy_auth/</code></td><td>API key management, JWT, custom auth</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Budget Management</td><td><code>budget_manager.py</code></td><td>Budget tracking, spending limits, budget alerts, monthly/quarterly/yearly</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr class="new-row"><td>Teams Management</td><td><code>proxy/management/</code></td><td><span class="tag tg-new">Moi</span> Team-based access control, internal users, project management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Guardrails</td><td><code>proxy/guardrails/</code></td><td>Content filtering, PII (Presidio), LLM-as-judge, Bedrock, custom code, tool permissions</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr class="new-row"><td>Secret Detection</td><td><code>enterprise/</code></td><td><span class="tag tg-new">Moi</span> 80+ credential patterns: OpenAI, GitHub, AWS, GCP, Azure, Slack, Discord, JWT...</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Observability</td><td><code>integrations/</code></td><td>30+ integrations: Langfuse, Datadog, Prometheus, OTel, Arize, Athina, Braintrust, DynamoDB, Galileo, Google Cloud, Hecileone, HumanLoop, Lago, LangSmith, Langtrace, Literal AI, Logfire, Lunary, MLflow, OpenMeter, PostHog, S3, SQS, Supabase, Traceloop, Vantage, Weights & Biases, Weave</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Prompt Management</td><td><code>integrations/</code></td><td>Prompt templates, versioning, variables, dotprompt support</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>RAG</td><td><code>rag/</code></td><td>Retrieval-Augmented Generation support</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Vector Stores</td><td><code>vector_stores/</code></td><td>Vector store CRUD & search, file management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Vector Store Files</td><td><code>vector_store_files/</code></td><td><span class="tag tg-new">Moi</span> File management for vector stores</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Reranking</td><td><code>rerank_api/</code></td><td>Reranking API</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Alerting</td><td><code>integrations/SlackAlerting/</code></td><td><span class="tag tg-new">Moi</span> Slack alerts, email (SendGrid, SMTP, Resend), PagerDuty, budget alerts, hanging request check</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Enterprise Hooks</td><td><code>enterprise/enterprise_hooks/</code></td><td><span class="tag tg-new">Moi</span> Aporia AI, banned keywords, blocked users, Google Text Moderation, OpenAI Moderation</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>LlamaGuard</td><td><code>enterprise/</code></td><td><span class="tag tg-new">Moi</span> LlamaGuard + LLM Guard integration</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Proxy Server</td><td><code>proxy/</code></td><td>OpenAI-compatible proxy: auth, rate limiting, logging, caching, routing, guardrails</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Admin UI</td><td><code>ui/litellm-dashboard/</code></td><td>Dashboard: keys, models, usage, teams, budgets, logs, guardrails, prompts, agents, MCP, vector stores</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>A2A Protocol</td><td><code>a2a_protocol/</code></td><td>Agent-to-Agent communication: client, server, card resolver. Providers: Bedrock, Pydantic AI, LiteLLM</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>MCP Support</td><td><code>experimental_mcp_client/</code></td><td>Model Context Protocol: client, tools, MCP server management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Compression</td><td><code>compression/</code></td><td>Context compression, content detection, message stubbing, BM25, embedding scoring</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Setup Wizard</td><td><code>setup_wizard.py</code></td><td><span class="tag tg-new">Moi</span> Initial configuration wizard</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Secret Managers</td><td><code>secret_managers/</code></td><td><span class="tag tg-new">Moi</span> Custom secret management</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>SSO</td><td><code>proxy_auth/</code></td><td><span class="tag tg-new">Moi</span> Auth0, Okta, Keycloak, Entra ID, WorkOS</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Docker Deploy</td><td><code>docker/</code>, <code>deploy/</code></td><td><span class="tag tg-new">Moi</span> Docker, K8s/Helm, Terraform, Azure RM deployment</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Prometheus Metrics</td><td><code>prometheus.yml</code></td><td><span class="tag tg-new">Moi</span> Prometheus integration cho monitoring</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>Audit Logging</td><td><code>proxy/audit_logging</code></td><td><span class="tag tg-new">Moi</span> Audit trail cho moi request</td><td><span class="tag tg-mid">TB</span></td></tr>
    </tbody>
  </table>

  <h4>Tinh nang moi bo sung (18+)</h4>
  <div class="feat-grid">
    <div class="feat-item new"><span class="dot d-new"></span> Fine-tuning API</div>
    <div class="feat-item new"><span class="dot d-new"></span> Assistants API</div>
    <div class="feat-item new"><span class="dot d-new"></span> Batches API</div>
    <div class="feat-item new"><span class="dot d-new"></span> Files API</div>
    <div class="feat-item new"><span class="dot d-new"></span> Real-time API (WebSocket)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Search API</div>
    <div class="feat-item new"><span class="dot d-new"></span> OCR Module</div>
    <div class="feat-item new"><span class="dot d-new"></span> Videos Module</div>
    <div class="feat-item new"><span class="dot d-new"></span> Evals Framework</div>
    <div class="feat-item new"><span class="dot d-new"></span> Enterprise Hooks</div>
    <div class="feat-item new"><span class="dot d-new"></span> Secret Detection (80+ patterns)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Teams + Projects Management</div>
    <div class="feat-item new"><span class="dot d-new"></span> SSO (Auth0, Okta, Keycloak...)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Alerting (Slack, Email, PagerDuty)</div>
    <div class="feat-item new"><span class="dot d-new"></span> Audit Logging</div>
    <div class="feat-item new"><span class="dot d-new"></span> Docker/K8s/Helm/Terraform</div>
    <div class="feat-item new"><span class="dot d-new"></span> Prometheus Metrics</div>
    <div class="feat-item new"><span class="dot d-new"></span> Setup Wizard + Skills Plugin</div>
  </div>

  <h4>Providers ho tro (100+)</h4>
  <div class="prov-list">
    <span class="prov-tag">OpenAI</span>
    <span class="prov-tag">Azure</span>
    <span class="prov-tag">Anthropic</span>
    <span class="prov-tag">Google/Gemini</span>
    <span class="prov-tag">AWS Bedrock</span>
    <span class="prov-tag">Mistral</span>
    <span class="prov-tag">Cohere</span>
    <span class="prov-tag">Groq</span>
    <span class="prov-tag">DeepSeek</span>
    <span class="prov-tag">Together AI</span>
    <span class="prov-tag">Replicate</span>
    <span class="prov-tag">HuggingFace</span>
    <span class="prov-tag">Perplexity</span>
    <span class="prov-tag">Fireworks</span>
    <span class="prov-tag">Ollama</span>
    <span class="prov-tag">vLLM</span>
    <span class="prov-tag">NVIDIA</span>
    <span class="prov-tag">IBM WatsonX</span>
    <span class="prov-tag">Clarifai</span>
    <span class="prov-tag">Petals</span>
    <span class="prov-tag">OpenRouter</span>
    <span class="prov-tag">Novita AI</span>
    <span class="prov-tag">AI21</span>
    <span class="prov-tag">Baseten</span>
    <span class="prov-tag">Databricks</span>
    <span class="prov-tag">Friendli</span>
    <span class="prov-tag">Maritalk</span>
    <span class="prov-tag">NLP Cloud</span>
    <span class="prov-tag">SageMaker</span>
    <span class="prov-tag">Voyage</span>
    <span class="prov-tag">XAI</span>
    <span class="prov-tag">va 70+ providers khac...</span>
  </div>

  <!-- 2.4 CrewAI -->
  <h3 style="color:#a78bfa">2.4 CrewAI</h3>
  <div class="info-box">
    <strong>Duong dan:</strong> <code>refer_project/ai-framework/crewai/lib/crewai/src/crewai/</code><br>
    <strong>Phien ban:</strong> 1.14.5a7<br>
    <strong>Sub-packages:</strong> crewai-core, crewai-tools, crewai-files, devtools, cli<br>
    <strong>Vai tro:</strong> Multi-agent orchestration layer<br>
    <strong>Tinh nang moi bo sung:</strong> 8
  </div>

  <h4>Tinh nang chi tiet (28 tinh nang)</h4>
  <table>
    <thead><tr><th>Tinh nang</th><th>Module</th><th>Mo ta</th><th>Uu tien</th></tr></thead>
    <tbody>
      <tr><td>Multi-Agent Orchestration</td><td><code>Crew</code> class</td><td>Quan ly agents, tasks, process flow (sequential/hierarchical). max_rpm, planning, verbose, memory, cache, callbacks, OTel</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Agent System</td><td><code>Agent</code> class</td><td>Core agent: role, goal, backstory, LLM config, function_calling_llm, max_iter, max_rpm, verbose, allow_delegation, tools, MCP, knowledge, apps</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Task Management</td><td><code>Task</code> class</td><td>Task voi expected_output, dependencies, agent assignment, context</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Process Flow</td><td><code>Process</code></td><td>Sequential, Hierarchical (manager agent dieu phoi)</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>LLM Integration</td><td><code>LLM</code> + <code>BaseLLM</code></td><td>Model configuration, function calling LLM rieng, chat_llm</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Tool System</td><td><code>crewai-tools/</code></td><td>Traditional tools + MCP servers + CrewAI apps integration</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Knowledge/RAG</td><td><code>Knowledge</code></td><td>Knowledge sources, RAG ingestion, knowledge query</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr><td>Memory System</td><td><code>Memory</code></td><td>Short-term, long-term, entity memory (lazy loading)</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Caching</td><td><code>Crew.cache</code></td><td>Tool execution caching</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Callbacks & Events</td><td><code>crewai_event_bus</code></td><td>Event-driven: start/complete, errors, knowledge queries, memory retrieval. task_callback, step_callback</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Flow Orchestration</td><td><code>Flow</code> class</td><td><span class="tag tg-new">Moi</span> Flow-based task orchestration, multi-step pipeline</td><td><span class="tag tg-high">Cao</span></td></tr>
      <tr class="new-row"><td>A2A Protocol</td><td><code>a2a/</code></td><td><span class="tag tg-new">Moi</span> Agent-to-Agent: auth (Auth0, Entra, Keycloak, Okta, WorkOS), client, server, card resolver, task helpers, streaming</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>LangGraph Adapter</td><td><code>agent_adapters/langgraph/</code></td><td><span class="tag tg-new">Moi</span> Tich hop LangGraph agents vao CrewAI</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>OpenAI Agents Adapter</td><td><code>agent_adapters/openai_agents/</code></td><td><span class="tag tg-new">Moi</span> Tich hop OpenAI Agents SDK vao CrewAI</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Agent Builder</td><td><code>agent_builder/</code></td><td><span class="tag tg-new">Moi</span> Xay dung agents va executors, output/token processing</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Cache Handlers</td><td><code>agent/cache/</code></td><td><span class="tag tg-new">Moi</span> Cache handling trong agent lifecycle</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr class="new-row"><td>Training System</td><td><code>CrewTrainingHandler</code></td><td><span class="tag tg-new">Moi</span> Agent training data management, training process</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr class="new-row"><td>CLI Tool</td><td><code>cli/</code></td><td><span class="tag tg-new">Moi</span> Command-line interface for CrewAI operations</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>OpenTelemetry</td><td><code>crewai-core/</code></td><td>Distributed tracing cho agent execution</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Planning</td><td><code>PlanningConfig</code></td><td>Task planning configuration, planning mode</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Security</td><td><code>Fingerprint</code>, <code>guardrail</code></td><td>Security: fingerprinting, guardrail utilities, security_config</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Rate Limiting</td><td><code>Crew.max_rpm</code></td><td>max_rpm control, Agent.max_rpm, Agent.max_iter</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Delegation</td><td><code>Agent.allow_delegation</code></td><td>Agent-to-agent task delegation, hierarchical delegation</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Checkpointing</td><td><code>CheckpointConfig</code></td><td>State persistence, resume execution after interruption</td><td><span class="tag tg-low">Thap</span></td></tr>
      <tr><td>Authentication</td><td><code>a2a/auth/</code></td><td>Auth0, Entra ID, Keycloak, Okta, WorkOS. Token management</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Output Types</td><td><code>CrewOutput</code>, <code>TaskOutput</code></td><td>Structured output: CrewOutput, TaskOutput, ExecutionContext, RuntimeState</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>LLMGuardrail</td><td><code>LLMGuardrail</code></td><td><span class="tag tg-new">Moi</span> LLM-based guardrail integration</td><td><span class="tag tg-mid">TB</span></td></tr>
      <tr><td>Entity</td><td><code>Entity</code></td><td><span class="tag tg-new">Moi</span> Entity management trong memory system</td><td><span class="tag tg-low">Thap</span></td></tr>
    </tbody>
  </table>

  <h4>Tinh nang moi bo sung (8)</h4>
  <div class="feat-grid">
    <div class="feat-item new"><span class="dot d-new"></span> Flow Orchestration</div>
    <div class="feat-item new"><span class="dot d-new"></span> A2A Protocol (auth, client, server)</div>
    <div class="feat-item new"><span class="dot d-new"></span> LangGraph Adapter</div>
    <div class="feat-item new"><span class="dot d-new"></span> OpenAI Agents Adapter</div>
    <div class="feat-item new"><span class="dot d-new"></span> Agent Builder</div>
    <div class="feat-item new"><span class="dot d-new"></span> Training System</div>
    <div class="feat-item new"><span class="dot d-new"></span> CLI Tool + Cache Handlers</div>
    <div class="feat-item new"><span class="dot d-new"></span> LLMGuardrail + Entity</div>
  </div>
</div>

<!-- ====== MUC 3: KE HOACH & HUONG DAN ====== -->
<div class="section">
  <h2>Muc 3: Ke Hoach Dua Vao Ung Dung &amp; Huong Dan Chi Tiet</h2>

  <h3>3.1 Kien Truc Nhung De Xuat (Cap nhat)</h3>
  <div class="phase-table">
    <div class="phase-header ph1">UI &amp; Integration Layer</div>
    <p style="color:#888;margin:0 0 12px 16px;font-size:0.9em">
      React/Svelte/Vue/Angular adapters, streaming UI, real-time updates, workflow visualization<br>
      <strong>Nguon:</strong> Vercel AI SDK (ui/, workflow/) + LiteLLM (Admin Dashboard)
    </p>

    <div style="text-align:center;color:#555;padding:4px 0;font-size:1.2em">V</div>

    <div class="phase-header ph2">Enterprise Infrastructure</div>
    <p style="color:#888;margin:0 0 12px 16px;font-size:0.9em">
      Auth/SSO, rate limiting, caching (Redis/In-Memory/Semantic), budget tracking, 
      guardrails (content/PII/LLM-judge), observability (30+ integrations), 
      cost calculation, alerting, secret detection, audit logging<br>
      <strong>Nguon:</strong> LiteLLM
    </p>

    <div style="text-align:center;color:#555;padding:4px 0;font-size:1.2em">V</div>

    <div class="phase-header ph3">Agent Pipeline Layer</div>
    <p style="color:#888;margin:0 0 12px 16px;font-size:0.9em">
      Runnable composition, ReAct agent, middleware, tool calling, multi-agent orchestration, 
      task management, A2A protocol, agent adapters (LangGraph/OpenAI), Flow, memory, RAG<br>
      <strong>Nguon:</strong> LangChain.js (runnables/ + agents/) + CrewAI (Crew/Agent/Task/Flow)
    </p>

    <div style="text-align:center;color:#555;padding:4px 0;font-size:1.2em">V</div>

    <div class="phase-header ph4">AI Provider Abstraction</div>
    <p style="color:#888;margin:0 0 12px 16px;font-size:0.9em">
      Unified API: text gen, streaming, structured output, embedding, image/speech/video, 
      tool calling, MCP client, workflow engine, middleware pipeline, 100+ providers<br>
      <strong>Nguon:</strong> Vercel AI SDK (full stack) + LiteLLM (router + 100+ providers)
    </p>
  </div>

  <h3>3.2 Lo Trinh Tich Hop Chi Tiet (Cap nhat - ~21 tuan)</h3>

  <div class="phase-header ph1" style="margin-top:20px">Phase 1: Core AI Engine (2-3 tuan)</div>
  <div class="guide-step">
    <span class="step-num">Buoc 1.1</span> <strong>Tich hop Vercel AI SDK core:</strong> Cai dat @ai-sdk/core, providers. generateText(), streamText() cho chat co ban.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 1.2</span> <strong>Structured Output:</strong> generateObject()/streamObject() voi Zod schemas.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 1.3</span> <strong>Tool Calling:</strong> tool(), dynamicTool(), ToolLoopAgent, tool approval workflow.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 1.4</span> <strong>Moi:</strong> Tool call repair, tool context, active tools filter.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 1.5</span> <strong>Moi:</strong> Token calculation, message pruning, reasoning extraction.
  </div>

  <div class="phase-header ph2" style="margin-top:20px">Phase 2: Enterprise Infrastructure (6-8 tuan)</div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.1</span> <strong>Model Router + Providers:</strong> LiteLLM Router, 100+ providers, load balancing, fallback, strategies.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.2</span> <strong>Caching System:</strong> In-memory, Redis, Qdrant semantic cache, dual cache.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.3</span> <strong>Auth + Rate Limiting:</strong> API keys, JWT, per-user/key/model rate limiting, cooldown.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.4</span> <strong>Moi: SSO + Teams:</strong> Auth0, Okta, Keycloak, Entra ID. Team/project management.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.5</span> <strong>Cost + Budget:</strong> Token counting, cost tracking, budget limits, spending alerts.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.6</span> <strong>Guardrails:</strong> Content filtering, PII (Presidio), LLM-as-judge, custom guardrails.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.7</span> <strong>Moi: Secret Detection + Audit:</strong> 80+ credential patterns, audit logging.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.8</span> <strong>Moi: Alerting:</strong> Slack, email (SendGrid/SMTP/Resend), PagerDuty, hanging request check.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.9</span> <strong>Observability:</strong> Langfuse, Datadog, Prometheus, OTel + 30+ integrations.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 2.10</span> <strong>Moi: Enterprise Hooks:</strong> Aporia AI, banned keywords, moderation, LlamaGuard.
  </div>

  <div class="phase-header ph3" style="margin-top:20px">Phase 3: Multi-Agent &amp; Advanced (6-8 tuan)</div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.1</span> <strong>Runnable Pipeline:</strong> Pipeline system: invoke, batch, stream, transform, retry, fallbacks.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.2</span> <strong>Moi: ReAct Agent:</strong> createAgent() voi structured output, middleware, streaming.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.3</span> <strong>Multi-Agent:</strong> CrewAI-style: Crew, Agent, Task, Process (sequential/hierarchical).
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.4</span> <strong>Moi: Flow + A2A:</strong> Flow orchestration, Agent-to-Agent protocol, LangGraph/OpenAI adapters.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.5</span> <strong>Memory &amp; RAG:</strong> Short/long-term/entity memory, Knowledge ingestion, RAG.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.6</span> <strong>Agent Delegation:</strong> Hierarchical management, agent-to-agent task delegation.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.7</span> <strong>Moi: Prompt Hub:</strong> LangChain Hub pull/push, prompt management, versioning.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 3.8</span> <strong>Moi: Storage + Serialization:</strong> In-memory, file system, encoder-backed storage.
  </div>

  <div class="phase-header ph4" style="margin-top:20px">Phase 4: Advanced Features + Platform (6-8 tuan)</div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.1</span> <strong>Multi-modal:</strong> Image gen, speech, transcription, video gen.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.2</span> <strong>Moi: Fine-tuning + Batches:</strong> Custom model fine-tuning, batch processing.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.3</span> <strong>Moi: Real-time API + Evals:</strong> WebSocket, LLM evaluation framework.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.4</span> <strong>Moi: MCP + Workflow:</strong> MCP client/server, WorkflowAgent, lifecycle hooks.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.5</span> <strong>Moi: Gateway + Files + Search:</strong> API gateway, file management, search, OCR, videos.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.6</span> <strong>UI Adapters:</strong> React/Svelte/Vue/Angular, real-time streaming, agent UI stream.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.7</span> <strong>Moi: Docker Deploy:</strong> Docker, K8s/Helm, Terraform, Prometheus monitoring.
  </div>
  <div class="guide-step">
    <span class="step-num">Buoc 4.8</span> <strong>Moi: Admin Dashboard:</strong> Keys, models, usage, teams, budgets, logs, guardrails...
  </div>
</div>

<!-- ====== MUC 4: BANG THONG KE KE HOACH ====== -->
<div class="section">
  <h2>Muc 4: Bang Thong Ke Ke Hoach Theo Phase</h2>

  <div class="info-box">
    <strong>Muc dich:</strong> Bang quan ly de theo doi tien do tung Phase, tinh nang, nguon framework tham khao, va trang thai trien khai.<br>
    <strong>Tong so tinh nang bo sung:</strong> 57 tinh nang moi duoc phat hien va bo sung trong phien nay.
  </div>

  <div class="phase-header ph1">Phase 1: CORE AI ENGINE (2-3 tuan)</div>
  <table>
    <thead>
      <tr><th style="width:30px">STT</th><th style="width:200px">Tinh nang</th><th>API/Module tham khao</th><th>Framework nguon</th><th style="width:70px">Thoi gian</th><th style="width:70px">Trang thai</th></tr>
    </thead>
    <tbody>
      <tr><td>1.1</td><td>Text Generation</td><td><code>generateText()</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>1.2</td><td>Streaming Text</td><td><code>streamText()</code>, <code>smoothStream()</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>1.3</td><td>Multi-Provider Support</td><td><code>createProviderRegistry()</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>1.4</td><td>Structured Output</td><td><code>generateObject()</code>, <code>streamObject()</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>1.5</td><td>Tool Calling System</td><td><code>tool()</code>, <code>dynamicTool()</code>, <code>ToolSet</code></td><td>Vercel AI SDK</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>1.6</td><td>Agent Loop (Basic)</td><td><code>ToolLoopAgent</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.7</td><td>Tool Approval Workflow <span class="tag tg-new">Moi</span></td><td><code>tool-approval-configuration.ts</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.8</td><td>Tool Call Repair <span class="tag tg-new">Moi</span></td><td><code>tool-call-repair-function.ts</code></td><td>Vercel AI SDK</td><td>1 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.9</td><td>Tool Context + Active Filter <span class="tag tg-new">Moi</span></td><td><code>tools-context-parameter.ts</code>, <code>filter-active-tools.ts</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>1.10</td><td>Middleware Pipeline</td><td><code>wrapLanguageModel()</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.11</td><td>Smooth Stream + Token Calc <span class="tag tg-new">Moi</span></td><td><code>smoothStream()</code>, <code>calculate-tokens-per-second.ts</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.12</td><td>Message Pruning <span class="tag tg-new">Moi</span></td><td><code>prune-messages.ts</code></td><td>Vercel AI SDK</td><td>1 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>1.13</td><td>Reasoning Extraction <span class="tag tg-new">Moi</span></td><td><code>extract-reasoning-content.ts</code></td><td>Vercel AI SDK</td><td>1 ngay</td><td>Cho</td></tr>
      <tr><td>1.14</td><td>Error Handling</td><td><code>error/</code> (20+ error classes)</td><td>Vercel AI SDK</td><td>1 ngay</td><td>Cho</td></tr>
      <tr><td>1.15</td><td>Embedding (Basic)</td><td><code>embed()</code>, <code>embedMany()</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr style="background:#1a1a2a"><td colspan="2"><strong>Tong Phase 1</strong></td><td>15 tinh nang core</td><td>Vercel AI SDK</td><td><strong>~4 tuan</strong></td><td>0/15</td></tr>
    </tbody>
  </table>

  <div class="phase-header ph2">Phase 2: ENTERPRISE INFRASTRUCTURE (6-8 tuan)</div>
  <table>
    <thead>
      <tr><th style="width:30px">STT</th><th style="width:200px">Tinh nang</th><th>API/Module tham khao</th><th>Framework nguon</th><th style="width:70px">Thoi gian</th><th style="width:70px">Trang thai</th></tr>
    </thead>
    <tbody>
      <tr><td>2.1</td><td>Model Router</td><td><code>Router</code>: load balancing, fallback, retries</td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr><td>2.2</td><td>In-Memory Cache</td><td><code>in_memory_cache.py</code></td><td>LiteLLM</td><td>1 ngay</td><td>Cho</td></tr>
      <tr><td>2.3</td><td>Redis Cache</td><td><code>redis_cache.py</code>, <code>redis_cluster_cache.py</code></td><td>LiteLLM</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>2.4</td><td>Semantic Cache</td><td><code>qdrant_semantic_cache.py</code></td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>2.5</td><td>API Key Auth</td><td><code>proxy_auth/</code>, JWT management</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>2.6</td><td>Rate Limiting</td><td><code>router.py</code>: per-user, per-key, cooldown</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.7</td><td>SSO Integration <span class="tag tg-new">Moi</span></td><td>Auth0, Okta, Keycloak, Entra ID, WorkOS</td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.8</td><td>Teams &amp; Projects <span class="tag tg-new">Moi</span></td><td>Internal users, project management endpoints</td><td>LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>2.9</td><td>Cost Tracking</td><td><code>cost_calculator.py</code>, <code>budget_manager.py</code></td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>2.10</td><td>Budget Management</td><td>Budget tracking, alerts, limits</td><td>LiteLLM</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>2.11</td><td>Content Filtering</td><td>Content filtering guardrails</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>2.12</td><td>PII Detection</td><td>Presidio-based PII detection</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>2.13</td><td>LLM-as-Judge</td><td>LLM-based content evaluation</td><td>LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.14</td><td>Secret Detection <span class="tag tg-new">Moi</span></td><td>80+ credential pattern detectors</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.15</td><td>Audit Logging <span class="tag tg-new">Moi</span></td><td>Audit trail for all requests</td><td>LiteLLM</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>2.16</td><td>Observability</td><td>Langfuse, Prometheus, Datadog, OTel</td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.17</td><td>Alerting System <span class="tag tg-new">Moi</span></td><td>Slack, email (SendGrid/SMTP/Resend), PagerDuty</td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>2.18</td><td>Enterprise Hooks <span class="tag tg-new">Moi</span></td><td>Aporia, banned keywords, moderation, LlamaGuard</td><td>LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>2.19</td><td>Prompt Management</td><td>Templates, versioning, variables</td><td>LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>2.20</td><td>Prompt Hub</td><td>LangChain Hub pull/push</td><td>LangChain.js</td><td>2 ngay</td><td>Cho</td></tr>
      <tr style="background:#1a1a2a"><td colspan="2"><strong>Tong Phase 2</strong></td><td>20 tinh nang enterprise</td><td>LiteLLM + LangChain</td><td><strong>~8 tuan</strong></td><td>0/20</td></tr>
    </tbody>
  </table>

  <div class="phase-header ph3">Phase 3: MULTI-AGENT &amp; PIPELINE (6-8 tuan)</div>
  <table>
    <thead>
      <tr><th style="width:30px">STT</th><th style="width:200px">Tinh nang</th><th>API/Module tham khao</th><th>Framework nguon</th><th style="width:70px">Thoi gian</th><th style="width:70px">Trang thai</th></tr>
    </thead>
    <tbody>
      <tr><td>3.1</td><td>Runnable Pipeline</td><td><code>Runnable</code>: invoke, batch, stream</td><td>LangChain.js</td><td>5 ngay</td><td>Cho</td></tr>
      <tr><td>3.2</td><td>Runnable Decorators</td><td><code>withRetry()</code>, <code>withFallbacks()</code></td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>3.3</td><td>Message System</td><td>Human/AI/System/Tool/Function messages</td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>3.4</td><td>Prompt Templates</td><td>Chat, Few-shot, Pipeline, Structured</td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>3.5</td><td>Output Parsers</td><td>JSON, XML, Structured (Zod), List</td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.6</td><td>ReAct Agent <span class="tag tg-new">Moi</span></td><td><code>createAgent()</code>: structured output, middleware</td><td>LangChain.js</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.7</td><td>Agent Middleware <span class="tag tg-new">Moi</span></td><td>Pre/post model, HITL, retries</td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.8</td><td>Storage Backends <span class="tag tg-new">Moi</span></td><td>InMemory, FileSystem, EncoderBacked</td><td>LangChain.js</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.9</td><td>Hub Integration <span class="tag tg-new">Moi</span></td><td>Prompt pull/push, model binding</td><td>LangChain.js</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>3.10</td><td>Multi-Agent Orchestration</td><td><code>Crew</code>: agents, tasks, processes</td><td>CrewAI</td><td>7 ngay</td><td>Cho</td></tr>
      <tr><td>3.11</td><td>Agent System</td><td><code>Agent</code>: role, goal, backstory</td><td>CrewAI</td><td>5 ngay</td><td>Cho</td></tr>
      <tr><td>3.12</td><td>Task Management</td><td><code>Task</code>: output, dependencies</td><td>CrewAI</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.13</td><td>Flow Orchestration <span class="tag tg-new">Moi</span></td><td><code>Flow</code>: flow-based task pipeline</td><td>CrewAI</td><td>4 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.14</td><td>A2A Protocol <span class="tag tg-new">Moi</span></td><td>Agent-to-Agent: client, server, auth</td><td>CrewAI + LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.15</td><td>Agent Adapters <span class="tag tg-new">Moi</span></td><td>LangGraph + OpenAI Agents adapters</td><td>CrewAI</td><td>5 ngay</td><td>Cho</td></tr>
      <tr><td>3.16</td><td>Agent Delegation</td><td>allow_delegation, hierarchical</td><td>CrewAI</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>3.17</td><td>Memory System</td><td>Short-term, long-term, entity</td><td>CrewAI</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>3.18</td><td>RAG Knowledge</td><td>Knowledge sources, ingestion</td><td>CrewAI</td><td>5 ngay</td><td>Cho</td></tr>
      <tr><td>3.19</td><td>Callbacks &amp; Events</td><td>task_callback, event bus</td><td>CrewAI</td><td>2 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>3.20</td><td>LLMGuardrail <span class="tag tg-new">Moi</span></td><td>LLM-based guardrail, Entity management</td><td>CrewAI</td><td>2 ngay</td><td>Cho</td></tr>
      <tr style="background:#1a1a2a"><td colspan="2"><strong>Tong Phase 3</strong></td><td>20 tinh nang</td><td>LangChain + CrewAI</td><td><strong>~8 tuan</strong></td><td>0/20</td></tr>
    </tbody>
  </table>

  <div class="phase-header ph4">Phase 4: ADVANCED FEATURES &amp; PLATFORM (6-8 tuan)</div>
  <table>
    <thead>
      <tr><th style="width:30px">STT</th><th style="width:200px">Tinh nang</th><th>API/Module tham khao</th><th>Framework nguon</th><th style="width:70px">Thoi gian</th><th style="width:70px">Trang thai</th></tr>
    </thead>
    <tbody>
      <tr><td>4.1</td><td>Image Generation</td><td><code>generateImage()</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>4.2</td><td>Speech/TTS</td><td><code>generate-speech/</code></td><td>Vercel + LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr><td>4.3</td><td>Video Generation</td><td><code>generate-video/</code></td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr><td>4.4</td><td>Transcription</td><td><code>transcribe/</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.5</td><td>MCP Integration <span class="tag tg-new">Moi</span></td><td><code>createMCPClient()</code>, OAuth, tools/resources</td><td>Vercel AI SDK</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.6</td><td>Workflow Engine <span class="tag tg-new">Moi</span></td><td><code>WorkflowAgent</code>, lifecycle hooks</td><td>Vercel AI SDK</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.7</td><td>Fine-tuning API <span class="tag tg-new">Moi</span></td><td><code>fine_tuning/</code></td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.8</td><td>Batches + Files API <span class="tag tg-new">Moi</span></td><td><code>batches/</code>, <code>files/</code></td><td>LiteLLM</td><td>4 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.9</td><td>Real-time API <span class="tag tg-new">Moi</span></td><td><code>realtime_api/</code> (WebSocket)</td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.10</td><td>Evals + Search <span class="tag tg-new">Moi</span></td><td><code>evals/</code>, <code>search/</code></td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.11</td><td>Gateway API <span class="tag tg-new">Moi</span></td><td><code>gateway/package</code>: spend, insights</td><td>Vercel AI SDK</td><td>3 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.12</td><td>Provider Utils <span class="tag tg-new">Moi</span></td><td><code>provider-utils/</code>: networking, data conversion</td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>4.13</td><td>Reranking</td><td><code>rerank/</code></td><td>Vercel AI SDK</td><td>2 ngay</td><td>Cho</td></tr>
      <tr><td>4.14</td><td>React UI Integration</td><td><code>react/</code>, <code>ui/</code></td><td>Vercel AI SDK</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.15</td><td>Admin Dashboard <span class="tag tg-new">Moi</span></td><td>Keys, models, usage, teams, budgets, logs</td><td>LiteLLM</td><td>7 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.16</td><td>Docker + K8s <span class="tag tg-new">Moi</span></td><td>Docker, Helm, Terraform, Prometheus</td><td>LiteLLM</td><td>5 ngay</td><td>Cho</td></tr>
      <tr class="new-row"><td>4.17</td><td>OCR + Videos <span class="tag tg-new">Moi</span></td><td><code>ocr/</code>, <code>videos/</code></td><td>LiteLLM</td><td>3 ngay</td><td>Cho</td></tr>
      <tr style="background:#1a1a2a"><td colspan="2"><strong>Tong Phase 4</strong></td><td>17 tinh nang</td><td>Vercel + LiteLLM</td><td><strong>~8 tuan</strong></td><td>0/17</td></tr>
    </tbody>
  </table>

  <h3 style="margin-top:30px">Tong Ket Toan Bo Ke Hoach</h3>
  <table>
    <thead>
      <tr><th>Phase</th><th>Noi dung</th><th>So tinh nang</th><th>Framework nguon</th><th>Thoi gian</th><th>Tien do</th></tr>
    </thead>
    <tbody>
      <tr><td><span class="tag" style="background:#1e3a5f;color:#60a5fa">Phase 1</span></td><td>Core AI Engine</td><td><strong>15</strong> (+6 moi)</td><td>Vercel AI SDK</td><td>~4 tuan</td><td>0/15</td></tr>
      <tr><td><span class="tag" style="background:#2e3a2e;color:#48bb78">Phase 2</span></td><td>Enterprise Infrastructure</td><td><strong>20</strong> (+8 moi)</td><td>LiteLLM + LangChain</td><td>~8 tuan</td><td>0/20</td></tr>
      <tr><td><span class="tag" style="background:#3e2a3e;color:#a78bfa">Phase 3</span></td><td>Multi-Agent &amp; Pipeline</td><td><strong>20</strong> (+9 moi)</td><td>LangChain + CrewAI</td><td>~8 tuan</td><td>0/20</td></tr>
      <tr><td><span class="tag" style="background:#3e2e1e;color:#ecc94b">Phase 4</span></td><td>Advanced + Platform</td><td><strong>17</strong> (+9 moi)</td><td>Vercel + LiteLLM</td><td>~8 tuan</td><td>0/17</td></tr>
      <tr style="background:#1a1a2a"><td><strong>Tong cong</strong></td><td></td><td><strong>72</strong> (+32 moi bo sung)</td><td>4 frameworks</td><td><strong>~28 tuan (7 thang)</strong></td><td>0/72</td></tr>
    </tbody>
  </table>

  <div class="info-box new-box" style="margin-top:20px">
    <strong>Thong ke bo sung phien nay:</strong>
    <ul style="color:#aaa;margin:8px 0 0 20px;line-height:1.8">
      <li>Phat hien them <strong>57 tinh nang</strong> moi tu ma nguon thuc te (14 Vercel + 6 LangChain + 18 LiteLLM + 8 CrewAI + 11 cross-cutting)</li>
      <li>So tinh nang tang tu <strong>46 -> 72</strong> (tang 57%)</li>
      <li>Thoi gian du kien tang tu <strong>~21 tuan -> ~28 tuan</strong> do pham vi mo rong</li>
      <li>Phat hien them <strong>14 packages</strong> trong Vercel AI SDK chua duoc phan tich truoc day</li>
      <li>Phat hien <strong>18 modules</strong> moi cua LiteLLM: fine-tuning, batches, assistans, evals, real-time API...</li>
      <li>Phat hien <strong>A2A Protocol</strong> duoc ho tro boi ca CrewAI va LiteLLM</li>
      <li>Phat hien <strong>Agent Adapters</strong> (LangGraph, OpenAI Agents) trong CrewAI</li>
    </ul>
  </div>

  <div class="info-box" style="margin-top:20px">
    <strong>Khuyen nghi:</strong>
    <ul style="color:#aaa;margin:8px 0 0 20px;line-height:1.8">
      <li><strong>Uu tien Phase 1 + Phase 2</strong> truoc de co core AI engine va enterprise infrastructure vung chac</li>
      <li><strong>Phase 3</strong> nen trien khai song song voi Phase 2 neu co team rieng</li>
      <li><strong>Phase 4</strong> trien khai cuoi cung sau khi da co day du nen tang</li>
      <li>Co the dung <strong>Vercel AI SDK lam core</strong> chinh + <strong>LiteLLM cho enterprise features</strong></li>
      <li>LangChain.js va CrewAI chi nen dung khi can tinh nang dac thu (pipeline composition, multi-agent)</li>
      <li><strong>57 tinh nang moi</strong> duoc phat hien cho thay cac framework nay con nhieu tien nang chua duoc khai thac</li>
    </ul>
  </div>
</div>

<div class="footer">
  Bao cao duoc tao tu dong boi AI Agent | Update 0.0.2 Beta2<br>
  (c) 2026 - Phan tich dua tren ma nguon thuc te cua 4 frameworks: Vercel AI SDK, LangChain.js, LiteLLM, CrewAI<br>
  <span style="color:#444">Tong so tinh nang: 72 | Bo sung phien nay: 57 | Thoi gian du kien: ~28 tuan</span>
</div>

</div>
</body>
</html>'''

with open(path, 'w', encoding='utf-8') as f:
    f.write(html)

print('HTML file generated successfully!')
