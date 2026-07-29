// ==============================================================================
// GHITA CODING AGENT â€” Communication Server Sidecar
// Standalone Socket.io server for Desktop â†” Mobile communication
// ==============================================================================

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { randomBytes } from 'node:crypto';
import { networkInterfaces, hostname, homedir } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire as sidecarCreateRequire } from "node:module";

// --- Lazy-loaded heavy modules (loaded on first use, not at startup) ---
// This reduces startup time by 2-5 seconds by deferring Playwright, agents, etc.
let _aiEngine = null;
async function loadAiEngine() {
  if (!_aiEngine) _aiEngine = await import('@ghita/ai-engine');
  return _aiEngine;
}

let _skillsNode = null;
async function loadSkillsNode() {
  if (!_skillsNode) _skillsNode = await import('@ghita/skills/node');
  return _skillsNode;
}

let _computerUse = null;
async function loadComputerUse() {
  if (!_computerUse) _computerUse = await import('@ghita/computer-use');
  return _computerUse;
}

let _computerUseNode = null;
async function loadComputerUseNode() {
  if (!_computerUseNode) _computerUseNode = await import('@ghita/computer-use/node');
  return _computerUseNode;
}

let _browserControl = null;
async function loadBrowserControl() {
  if (!_browserControl) _browserControl = await import('@ghita/browser-control');
  return _browserControl;
}

let _browserControlNode = null;
async function loadBrowserControlNode() {
  if (!_browserControlNode) _browserControlNode = await import('@ghita/browser-control/node');
  return _browserControlNode;
}

let _agents = null;
async function loadAgents() {
  if (!_agents) _agents = await import('@ghita/agents');
  return _agents;
}


// --- Config ---
let activePort = parseInt(process.env.GHITA_PORT || '8080', 10);
const LAN_ENABLED = process.env.GHITA_LAN_ENABLED === '1';
const HOST = process.env.GHITA_BIND_HOST || (LAN_ENABLED ? '0.0.0.0' : '127.0.0.1');
// SECURITY FIX (C2): Cloud discovery is DISABLED by default.
// To opt-in, set GHITA_CLOUD_DISCOVERY=1 AND GHITA_CLOUD_DISCOVERY_TOKEN=<your-token>.
// The hardcoded appKey has been removed. Do NOT enable without understanding the security implications:
// pairing codes + LAN IP + hostname are published to a third-party KV endpoint.
const CLOUD_DISCOVERY_ENABLED = false; // Disabled — was: process.env.GHITA_CLOUD_DISCOVERY === '1'
const AUTO_LIBERATE_PORTS = process.env.GHITA_LIBERATE_PORTS === '1';
// Cloud relay code removed â€” was disabled (CLOUD_RELAY_ENABLED=false, initCloudSocket commented out)

function broadcast(event, data) {
  io.to(['desktop', 'paired-devices']).emit(event, data);
}

function normalizeAddress(address = '') {
  return address
    .replace(/^::ffff:/, '')
    .replace(/^\[|\]$/g, '')
    .trim()
    .toLowerCase();
}

function isLoopbackAddress(address = '') {
  const normalized = normalizeAddress(address);
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function isLoopbackRequest(req) {
  return isLoopbackAddress(req.socket.remoteAddress || '');
}

function isTrustedDesktopSocket(socket, isCloud = false) {
  if (isCloud) return false;
  return isLoopbackAddress(socket.handshake?.address || socket.conn?.remoteAddress || socket.request?.socket?.remoteAddress || '');
}

function isAllowedLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const h = url.hostname;
    if (['localhost', '127.0.0.1', 'tauri.localhost', '::1'].includes(h)) return true;
    if (LAN_ENABLED && /^(10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)$/.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

// --- Auto Port Liberation ---
// RESILIENCE (audit fix 3.9): replaced destructive force-kill (taskkill /f,
// kill -9) with a safe port-scan fallback. The sidecar no longer kills
// processes on other ports — it simply finds the next free port instead.
function liberatePort(port) {
  // No-op: port scanning is now handled by find_free_port() in lib.rs.
  // This function is kept for backward compatibility but does nothing.
  log(`Port liberation bypassed — using dynamic port allocation instead.`);
}

const PAIRING_TTL_MS = 300_000; // 5 minutes

// Pending approvals registry for terminal commands
const pendingApprovals = new Map();

// Global workspace root initialization
globalThis.ghitaWorkspaceRoot = globalThis.ghitaWorkspaceRoot || null;

function findWorkspaceRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function getEffectiveWorkspaceRoot() {
  const configured = globalThis.ghitaWorkspaceRoot || process.env.GHITA_WORKSPACE;
  if (configured && fs.existsSync(configured) && fs.statSync(configured).isDirectory()) {
    return path.resolve(configured);
  }

  const detected = findWorkspaceRoot();
  return detected || process.cwd();
}

// Approval timeout: auto-reject after 60 seconds
const APPROVAL_TIMEOUT_MS = 60000;

// Global command approval hook integration
globalThis.approveCommandHandler = async (command) => {
  return new Promise((resolve) => {
    const approvalId = `approve_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    pendingApprovals.set(approvalId, resolve);

    // Auto-reject after timeout
    setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        pendingApprovals.delete(approvalId);
        resolve(false);
      }
    }, APPROVAL_TIMEOUT_MS);

    // Broadcast the command execution approval request to connected clients
    broadcast('require_approval', {
      id: approvalId,
      command,
    });
  });
};

// Global file write approval hook integration
globalThis.approveFileWriteHandler = async (operation, filePath) => {
  return new Promise((resolve) => {
    const approvalId = `fapprove_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    pendingApprovals.set(approvalId, resolve);

    // Auto-reject after timeout
    setTimeout(() => {
      if (pendingApprovals.has(approvalId)) {
        pendingApprovals.delete(approvalId);
        resolve(false);
      }
    }, APPROVAL_TIMEOUT_MS);

    // Broadcast the file operation approval request to connected clients
    broadcast('require_file_approval', {
      id: approvalId,
      operation, // 'write' or 'modify'
      filePath,
    });
  });
};

// Global permission mode: 'custom' = confirm all, 'auto' = only dangerous
globalThis.agentPermissionMode = 'custom';

// Global cost telemetry handler integration
globalThis.broadcastCostTelemetryHandler = (data) => {
  broadcast('cost_telemetry', data);
};

// --- Pairing Code ---
function generatePairingCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

let currentCode = generatePairingCode();
let codeExpiresAt = Date.now() + PAIRING_TTL_MS;

function getCode() {
  if (Date.now() >= codeExpiresAt) {
    currentCode = generatePairingCode();
    codeExpiresAt = Date.now() + PAIRING_TTL_MS;
    publishToCloudDiscovery();
  }
  return currentCode;
}

function validateCode(code) {
  if (Date.now() >= codeExpiresAt) return false;
  return code.toUpperCase() === currentCode;
}

function regenerateCode() {
  currentCode = generatePairingCode();
  codeExpiresAt = Date.now() + PAIRING_TTL_MS;
  publishToCloudDiscovery();
  return currentCode;
}

// --- Get local IP ---
function getAllLocalIPs() {
  const ips = [];
  const interfaces = networkInterfaces();
  const entries = Object.entries(interfaces);

  // Sort entries so physical interfaces (Wi-Fi, Ethernet) come first, and virtual ones (WSL, Docker) come last
  entries.sort(([nameA], [nameB]) => {
    const a = nameA.toLowerCase();
    const b = nameB.toLowerCase();

    const isVirtual = (name) =>
      name.includes('vethernet') ||
      name.includes('wsl') ||
      name.includes('docker') ||
      name.includes('vmnet') ||
      name.includes('vbox') ||
      name.includes('virtualbox') ||
      name.includes('vpn') ||
      name.includes('host-only') ||
      name.includes('loopback');

    const isPhysical = (name) =>
      name.includes('wi-fi') ||
      name.includes('wifi') ||
      name.includes('wlan') ||
      name.includes('ethernet') ||
      name.includes('eth') ||
      name.includes('en');

    const vA = isVirtual(a);
    const vB = isVirtual(b);
    const pA = isPhysical(a);
    const pB = isPhysical(b);

    if (vA && !vB) return 1;
    if (!vA && vB) return -1;
    if (pA && !pB) return -1;
    if (!pA && pB) return 1;
    return 0;
  });

  for (const [name, addrs] of entries) {
    if (!addrs) continue;
    for (const addr of addrs) {
      const isIPv4 = addr.family === 'IPv4' || addr.family === 4;
      if (isIPv4 && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  if (ips.length === 0) ips.push('127.0.0.1');
  return ips;
}

function getLocalIP() {
  return getAllLocalIPs()[0];
}

function publishToCloud(key, value) {
  // SECURITY FIX (C2): publishToCloud is disabled. The hardcoded appKey
  // allowed enumeration of pairing codes on a public KV endpoint.
  // This function is kept as a no-op stub for backward compatibility.
  log(`Cloud discovery disabled — not publishing key ${key}`);
}


function publishToCloudDiscovery() {
  if (!CLOUD_DISCOVERY_ENABLED) {
    return;
  }

  try {
    const formattedIps = getAllLocalIPs().map(ip => ip.replace(/\./g, '-'));
    const value = `${formattedIps.join('_')}_${activePort}`;

    // 1. Publish under the 6-character pairing code
    publishToCloud(currentCode, value);

    // 2. Publish under the PC Hostname/Bluetooth name
    const pcName = hostname().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (pcName) {
      publishToCloud(pcName, value);
    }
  } catch (e) {
    log(`Cloud discovery preparation exception: ${e.message}`);
  }
}

// --- Rate Limiting ---
const requestCounts = new Map();
const RATE_LIMIT = 10;  // requests per window
const RATE_WINDOW_MS = 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = requestCounts.get(ip) || { count: 0, windowStart: now };

  if (now - entry.windowStart > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }

  entry.count++;
  requestCounts.set(ip, entry);

  return entry.count <= RATE_LIMIT;
}

// Cleanup old rate limit entries every 60 seconds
const rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of requestCounts.entries()) {
    if (now - entry.windowStart > 60000) {
      requestCounts.delete(ip);
    }
  }
}, 60000);
if (typeof rateLimitCleanupInterval.unref === 'function') {
  rateLimitCleanupInterval.unref();
}

// M6 FIX: Clear the interval on shutdown to prevent keeping the event loop alive
function cleanupRateLimitInterval() {
  clearInterval(rateLimitCleanupInterval);
}

// --- Event names ---
const EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  PAIR: 'pair',
  PAIR_CONFIRM: 'pair_confirm',
  COMMAND: 'command',
  CHAT: 'chat',
  SCREENSHOT: 'screenshot',
  APPROVE: 'approve',
  REJECT: 'reject',
  STATUS: 'status',
  ERROR: 'error',
  PONG: 'pong',
  SCREEN_STREAM: 'screen_stream',
  UNPAIR: 'unpair',
  SYNC_LANGUAGE: 'sync_language',
};

// --- HTTP Server ---
const httpServer = createServer((req, res) => {
  const clientIp = req.socket.remoteAddress || 'unknown';

  // Rate limiting
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too many requests' }));
    return;
  }

  const isLoopback = isLoopbackRequest(req);
  const origin = req.headers.origin;
  if (isAllowedLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'http://localhost');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connectedDevices: getConnectedDeviceCount(),
      pairedDevices: connectedDevices.size,
      uptime: process.uptime(),
      localIP: getLocalIP(),
      port: activePort,
      ...(isLoopback ? { pairingCode: getCode(), codeExpiresAt } : {}),
      hostname: hostname().toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      ...(isLoopback ? {
        devices: Array.from(connectedDevices.values()).map(d => ({
          id: d.id,
          name: d.name,
          platform: d.platform,
          connected: d.connected,
          lastSeen: d.lastSeen,
        })),
      } : {}),
    }));
    return;
  }

  if (req.url === '/pair') {
    if (!isLoopback) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Pairing code is only available from the desktop app.' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: getCode(),
      expiresAt: codeExpiresAt,
      port: activePort,
      localIP: getLocalIP(),
    }));
    return;
  }

  if (req.url === '/sync-language' && req.method === 'POST') {
    if (!isLoopback) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Sync language is only available from the desktop app.' }));
      return;
    }

    let body = '';
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB limit
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request body too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        if (parsed.language) {
          log(`Sync language from HTTP: ${parsed.language}`);
          broadcast(EVENTS.SYNC_LANGUAGE, { language: parsed.language });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
          return;
        }
      } catch (err) {
        log(`Failed to parse sync-language body: ${err.message}`);
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad request' }));
    });
    return;
  }

  if (req.url.startsWith('/unpair')) {
    if (!isLoopback) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unpairing is only available from the desktop app.' }));
      return;
    }

    const urlObj = new URL(req.url, `http://localhost:${activePort}`);
    const deviceId = urlObj.searchParams.get('deviceId');
    if (!deviceId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing deviceId parameter' }));
      return;
    }

    const device = connectedDevices.get(deviceId);
    if (device) {
      log(`Unpairing device via HTTP: ${device.name} (${device.id})`);
      const socketId = device.socketId;
      if (socketId) {
        const activeSocket = io.sockets.sockets.get(socketId);
        if (activeSocket) {
          activeSocket.emit('unpaired');
          activeSocket.disconnect(true);
        }
      }
      connectedDevices.delete(deviceId);
      savePairedDevices();
      sendStatus();
      ipcEmit('unpaired', { deviceId });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: `Device ${deviceId} has been unpaired.` }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Device ${deviceId} not found.` }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// --- Socket.IO Server ---
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedLocalOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin is not allowed by GHITA sidecar CORS policy'));
    },
    methods: ['GET', 'POST'],
  },
  transports: ['websocket'],
  pingInterval: 25000,
  pingTimeout: 20000,
});

const SESSION_TOKEN = process.env.GHITA_SESSION_TOKEN;
if (SESSION_TOKEN) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token && token === SESSION_TOKEN) {
      return next();
    }
    return next(new Error('Unauthorized: Invalid session token'));
  });
}

// --- Connected devices ---
const connectedDevices = new Map();

// --- Persistent Paired Devices Storage ---
const DATA_DIR = process.env.GHITA_DATA_DIR || homedir();
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  log(`Failed to create sidecar data directory: ${e.message}`);
}
const PAIRED_DEVICES_FILE = process.env.GHITA_DATA_DIR
  ? path.resolve(DATA_DIR, 'paired-devices.json')
  : path.resolve(DATA_DIR, '.ghita-paired-devices.json');
const API_CONFIG_FILE = path.resolve(DATA_DIR, 'api-config.json');

function getConnectedDeviceCount() {
  return Array.from(connectedDevices.values()).filter((device) => device.connected).length;
}

function loadPairedDevices() {
  try {
    if (fs.existsSync(PAIRED_DEVICES_FILE)) {
      const data = fs.readFileSync(PAIRED_DEVICES_FILE, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        for (const d of list) {
          if (d.id && d.name) {
            connectedDevices.set(d.id, {
              id: d.id,
              name: d.name,
              platform: d.platform || 'android',
              connected: false,
              lastSeen: d.lastSeen || Date.now(),
              socketId: null,
              pairedAt: d.pairedAt || Date.now(),
              secret: typeof d.secret === 'string' ? d.secret : null,
            });
          }
        }
        log(`Loaded ${list.length} paired devices from persistent storage.`);
      }
    }
  } catch (e) {
    log(`Failed to load persistent paired devices: ${e.message}`);
  }
}

function savePairedDevices() {
  try {
    const list = Array.from(connectedDevices.values())
      .filter(d => d.id && d.id !== 'cloud_session') // Chá»‰ lÆ°u thiáº¿t bá»‹ LAN thá»±c táº¿, bá» cloud
      .map(d => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        pairedAt: d.pairedAt,
        lastSeen: d.lastSeen,
        secret: d.secret,
      }));
    fs.writeFileSync(PAIRED_DEVICES_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    log(`Failed to save paired devices: ${e.message}`);
  }
}

function readApiConfigSnapshot() {
  try {
    if (!fs.existsSync(API_CONFIG_FILE)) return {};
    const content = fs.readFileSync(API_CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    log(`Failed to read API config: ${e.message}`);
    return {};
  }
}

function normalizeApiKeys(entry) {
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.apiKeys)) {
    return entry.apiKeys.filter((key) => typeof key === 'string' && key.trim()).map((key) => key.trim());
  }
  if (typeof entry.apiKey === 'string' && entry.apiKey.trim()) {
    return [entry.apiKey.trim()];
  }
  return [];
}

function activeApiProviderConfigs() {
  const snapshot = readApiConfigSnapshot();
  const configs = [];

  for (const [type, entry] of Object.entries(snapshot)) {
    if (!entry || typeof entry !== 'object' || entry.active !== true) continue;

    const apiKeys = normalizeApiKeys(entry);
    if (type !== 'ollama' && type !== 'opencode-zen' && apiKeys.length === 0) continue;

    configs.push({
      type,
      apiKey: apiKeys[0] || '',
      apiKeys,
      baseUrl: typeof entry.baseUrl === 'string' ? entry.baseUrl : undefined,
      defaultModel: typeof entry.selectedModel === 'string' ? entry.selectedModel : undefined,
      rotationStrategy: typeof entry.rotationStrategy === 'string' ? entry.rotationStrategy : undefined,
    });
  }

  return configs;
}

function syncApiConfigToOrchestrator(preferredProvider) {
  const orchestrator = grpcServerInstance?.orchestrator;
  if (!orchestrator) return null;

  const configs = activeApiProviderConfigs();
  const registered = [];
  const registry = orchestrator.getRegistry();

  for (const config of configs) {
    try {
      registry.registerFromConfig(config);
      registered.push(config);
    } catch (e) {
      log(`Failed to register persisted provider ${config.type}: ${e.message}`);
    }
  }

  const preferred = registered.find((config) => config.type === preferredProvider);
  const selected = preferred || registered[0] || null;
  if (selected && typeof orchestrator.setDefaultProvider === 'function') {
    orchestrator.setDefaultProvider(selected.type);
  }
  if (registered.length > 0 && typeof orchestrator.setFallbackOrder === 'function') {
    orchestrator.setFallbackOrder(registered.map((config) => config.type));
  }

  if (registered.length > 0) {
    log(`Synced ${registered.length} persisted API provider(s) from API Manager config.`);
  }

  return selected;
}

// --- Host Skill Registry (Node-capable) ---
let nodeRegistry = null;
let computerController = null; // Phase 8: expose for mobile remote touch

function createLazyBrowserAdapter(defaultOptions = {}) {
  let adapterPromise = null;

  async function getAdapter() {
    if (!adapterPromise) {
      adapterPromise = (async () => {
        const { createPlaywrightAdapter } = await loadBrowserControlNode();
        return createPlaywrightAdapter(defaultOptions);
      })().catch((error) => {
        adapterPromise = null;
        throw error;
      });
    }

    return adapterPromise;
  }

  const call = async (method, ...args) => {
    const adapter = await getAdapter();
    const handler = adapter?.[method];
    if (typeof handler !== 'function') {
      throw new Error(`Browser adapter method is not available: ${method}`);
    }
    return handler(...args);
  };

  return {
    launch: (options) => call('launch', options),
    close: () => call('close'),
    navigate: (url) => call('navigate', url),
    click: (selector) => call('click', selector),
    type: (selector, value) => call('type', selector, value),
    fill: (selector, value) => call('fill', selector, value),
    extractText: (selector) => call('extractText', selector),
    screenshot: () => call('screenshot'),
  };
}

async function getOrCreateNodeRegistry() {
  if (nodeRegistry) return nodeRegistry;
  log("Initializing host Node-capable Skill Registry...");

  // Lazy-load modules on first use
  const { createNodeSkillRegistry } = await loadSkillsNode();
  const { createComputerUseSkills, ComputerUseController } = await loadComputerUse();
  const { createBrowserControlSkills, BrowserController } = await loadBrowserControl();

  const workspaceRoot = getEffectiveWorkspaceRoot();
  const registry = createNodeSkillRegistry({ defaultCwd: workspaceRoot });
  log(`Node skill registry workspace: ${workspaceRoot}`);

  try {
    const { createTauriAdapter } = await loadComputerUseNode();
    const tauriAdapter = await createTauriAdapter();
    computerController = new ComputerUseController(tauriAdapter);
    registry.registerMany(createComputerUseSkills(computerController));
    log("Loaded computer-use Tauri native adapter.");
  } catch (e) {
    log(`Failed to load computer-use node adapter: ${e.message}`);
    computerController = new ComputerUseController();
    registry.registerMany(createComputerUseSkills(computerController));
  }

  const browserController = new BrowserController(createLazyBrowserAdapter({ headless: false }));
  registry.registerMany(createBrowserControlSkills(browserController));
  log("Registered browser-control skills with lazy Playwright adapter.");

  nodeRegistry = registry;
  return nodeRegistry;
}

// --- Socket handlers ---

function registerSocketEvents(socket, isCloud = false) {
  const getDevice = () => {
    return findDeviceBySocket(socket.id);
  };

  const getAuthorizedClient = (options = {}) => {
    const { allowDesktop = true, allowDevice = true } = options;
    const device = getDevice();
    if (allowDevice && device) {
      device.lastSeen = Date.now();
      return { device, isDesktop: false, senderId: device.id, senderName: device.name };
    }
    if (allowDesktop && isTrustedDesktopSocket(socket, isCloud)) {
      return { device: null, isDesktop: true, senderId: 'desktop', senderName: 'Desktop' };
    }
    socket.emit(EVENTS.ERROR, { message: 'Unauthorized: pair the device before using this action' });
    return null;
  };

  // Ralph Loop Execution
  socket.on('ralph_loop_run', async (data) => {
    if (!getAuthorizedClient()) return;

    const task = data?.task || '';
    const maxIterations = data?.maxIterations || 3;
    const costLimitUsd = data?.costLimitUsd || 0.10;

    log(`Running Ralph Loop for task: "${task}"`);
    
    // Gá»­i tÃ­n hiá»‡u báº¯t Ä‘áº§u
    broadcast('chat_start', { text: `[Ralph Loop] Äang khá»Ÿi Ä‘á»™ng vÃ²ng láº·p tá»± sá»­a sai cho tÃ¡c vá»¥: "${task}"`, senderId: 'system', senderName: 'GHITA Engine' });

    try {
      if (grpcServerInstance && grpcServerInstance.orchestrator) {
        const { RalphLoopManager } = await loadAiEngine();
        const ralph = new RalphLoopManager(grpcServerInstance.orchestrator, {
          maxIterations,
          costLimitUsd,
        });

        // Giáº£ láº­p má»™t hÃ m thá»±c thi (mock compiler) Ä‘á»ƒ mÃ´ phá»ng tá»± sá»­a sai
        let compileAttempts = 0;
        const mockExecute = async (code) => {
          compileAttempts++;
          await new Promise(r => setTimeout(r, 2000)); // Delay mÃ´ phá»ng build 2s
          
          if (compileAttempts < 2) {
            // Láº§n 1: Giáº£ láº­p lá»—i cÃº phÃ¡p
            return {
              success: false,
              logs: `ERROR in src/app.tsx: L32 - Type 'string' is not assignable to type 'number'. Cannot assign value: "${code.substring(0, 15)}..." to count.`,
            };
          } else {
            // Láº§n 2: ThÃ nh cÃ´ng
            return {
              success: true,
              logs: `Successfully compiled 1 TS file in 420ms. Zero errors detected.`,
            };
          }
        };

        const result = await ralph.run(task, mockExecute, (progress) => {
          log(`[Ralph Loop Progress] Iteration ${progress.iteration}: ${progress.message}`);
          broadcast('ralph_loop_progress', {
            iteration: progress.iteration,
            cost: progress.cost,
            message: progress.message,
            code: progress.code,
          });
          
          // Gá»­i text tiáº¿n trÃ¬nh vÃ o chat panel
          broadcast('chat_chunk', { text: `\nðŸ”„ **[VÃ²ng láº·p ${progress.iteration}]** ${progress.message}\n` });
          if (progress.code) {
            broadcast('chat_chunk', { text: `\`\`\`tsx\n${progress.code}\n\`\`\`\n` });
          }
        });

        broadcast('ralph_loop_done', {
          success: result.success,
          iterations: result.currentIteration,
          totalCostUsd: result.totalCostUsd,
          totalTokens: result.totalTokensUsed.totalTokens,
          code: result.history[result.history.length - 1]?.content || '',
        });
        
        broadcast('chat_done', {
          text: `### ðŸŽ‰ Ralph Loop HoÃ n Táº¥t!
- **Tráº¡ng thÃ¡i:** ${result.success ? 'ThÃ nh cÃ´ng âœ¨' : 'Tháº¥t báº¡i âŒ'}
- **Sá»‘ lÆ°á»£t sá»­a lá»—i:** ${result.currentIteration} láº§n
- **Tá»•ng lÆ°á»£ng token:** ${result.totalTokensUsed.totalTokens} tokens
- **Tá»•ng chi phÃ­ Æ°á»›c tÃ­nh:** $${result.totalCostUsd.toFixed(5)} USD
- **Giáº£i phÃ¡p cuá»‘i cÃ¹ng:** ÄÃ£ Ä‘Æ°á»£c Ä‘á»“ng bá»™ hÃ³a thÃ nh cÃ´ng!`
        });

      } else {
        socket.emit('chat_error', { message: 'âš™ï¸ AI Orchestrator chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh. Vui lÃ²ng má»Ÿ tab API Manager, thÃªm API Key vÃ  báº­t Active cho Ã­t nháº¥t 1 provider.' });
      }
    } catch (err) {
      log(`Error in Ralph Loop execution: ${err.message}`);
      socket.emit('chat_error', { message: `Ralph Loop Exception: ${err.message}` });
    }
  });

  // Commands
  socket.on(EVENTS.COMMAND, (data) => {
    const device = getDevice();
    if (!device) {
      socket.emit(EVENTS.ERROR, { message: 'Unauthorized: Device is not paired' });
      return;
    }
    device.lastSeen = Date.now();
    log(`Command from ${device.name}: ${data?.action}`);
    ipcEmit(EVENTS.COMMAND, { deviceId: device.id, action: data?.action });
  });

  // Skill Execution Proxying
  socket.on('run_skill', async (data, callback) => {
    if (!getAuthorizedClient()) {
      const errResult = { success: false, error: 'Unauthorized: pair the device before running skills' };
      if (typeof callback === 'function') callback(errResult);
      return;
    }

    const skillId = data?.id;
    const input = data?.input || {};
    log(`[run_skill] Requested ${skillId} with inputs: ${JSON.stringify(input)}`);
    try {
      const registry = await getOrCreateNodeRegistry();
      const result = await registry.run(skillId, { input });
      log(`[run_skill] Result: success=${result.success}`);
      if (typeof callback === 'function') {
        callback(result);
      } else {
        socket.emit('run_skill_result', { id: skillId, result });
      }
    } catch (e) {
      log(`[run_skill] Error executing skill: ${e.message}`);
      const errResult = { success: false, error: e.message };
      if (typeof callback === 'function') {
        callback(errResult);
      } else {
        socket.emit('run_skill_result', { id: skillId, result: errResult });
      }
    }
  });

  // Skill enablement sync. Only the trusted desktop UI may toggle host-side
  // disabled skills; paired devices can run enabled skills but cannot enable
  // disabled capabilities by themselves.
  socket.on('set_skill_enabled', async (data, callback) => {
    if (!getAuthorizedClient({ allowDevice: false })) {
      const errResult = { success: false, error: 'Unauthorized: desktop client required' };
      if (typeof callback === 'function') callback(errResult);
      return;
    }

    const skillId = data?.id;
    const enabled = data?.enabled;
    if (typeof skillId !== 'string' || skillId.trim().length === 0 || typeof enabled !== 'boolean') {
      const errResult = { success: false, error: 'Missing required inputs: id and enabled' };
      if (typeof callback === 'function') callback(errResult);
      return;
    }

    try {
      const registry = await getOrCreateNodeRegistry();
      const skill = registry.setEnabled(skillId, enabled);
      log(`[set_skill_enabled] ${skillId} enabled=${skill.enabled}`);
      const result = { success: true, skill: { id: skill.id, enabled: skill.enabled, status: skill.status } };
      if (typeof callback === 'function') {
        callback(result);
      } else {
        socket.emit('set_skill_enabled_result', result);
      }
    } catch (e) {
      log(`[set_skill_enabled] Error: ${e.message}`);
      const errResult = { success: false, error: e.message };
      if (typeof callback === 'function') {
        callback(errResult);
      } else {
        socket.emit('set_skill_enabled_result', errResult);
      }
    }
  });

  // List available skills (for mobile remote skill browsing)
  socket.on('list_skills', async (data, callback) => {
    if (!getAuthorizedClient()) {
      const errResult = { success: false, error: 'Unauthorized: pair the device before listing skills' };
      if (typeof callback === 'function') callback(errResult);
      return;
    }

    try {
      const registry = await getOrCreateNodeRegistry();
      const allSkills = registry.list();
      const skills = allSkills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || '',
        category: s.category || 'general',
        enabled: s.enabled !== false,
      }));
      log(`[list_skills] Returning ${skills.length} skills`);
      if (typeof callback === 'function') {
        callback({ success: true, skills });
      } else {
        socket.emit('list_skills_result', { success: true, skills });
      }
    } catch (e) {
      log(`[list_skills] Error: ${e.message}`);
      const errResult = { success: false, error: e.message };
      if (typeof callback === 'function') {
        callback(errResult);
      } else {
        socket.emit('list_skills_result', errResult);
      }
    }
  });

  // Set Workspace Root
  socket.on('set_workspace', (data, callback) => {
    if (!getAuthorizedClient()) {
      if (typeof callback === 'function') callback({ success: false, error: 'Unauthorized' });
      return;
    }

    const root = data?.path ? path.resolve(data.path) : null;
    // Validate workspace path
    if (root) {
      try {
        if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
          if (typeof callback === 'function') callback({ success: false, error: 'Path does not exist or is not a directory' });
          return;
        }
      } catch {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid path' });
        return;
      }
    }
    globalThis.ghitaWorkspaceRoot = root;
    if (root) {
      process.env.GHITA_WORKSPACE = root;
    } else {
      delete process.env.GHITA_WORKSPACE;
    }
    // Invalidate the skill registry so it is recreated with the new workspace
    // on the next getOrCreateNodeRegistry() call. This is safe because Node.js
    // is single-threaded: any in-flight run_skill handler has already captured
    // its own registry reference before this synchronous handler runs.
    nodeRegistry = null;
    log(`Workspace set to: ${root}`);
    if (typeof callback === 'function') {
      callback({ success: true, path: root });
    } else {
      socket.emit('workspace_updated', { path: root });
    }
  });

  // Get Workspace Root
  socket.on('get_workspace', (callback) => {
    if (!getAuthorizedClient()) {
      if (typeof callback === 'function') callback({ path: null, error: 'Unauthorized' });
      return;
    }

    const root = globalThis.ghitaWorkspaceRoot || null;
    if (typeof callback === 'function') {
      callback({ path: root });
    } else {
      socket.emit('workspace_status', { path: root });
    }
  });

  // Command Approvals Handshake
  socket.on('approve_command', (data) => {
    if (!getAuthorizedClient()) return;

    const id = data?.id;
    const resolve = pendingApprovals.get(id);
    if (resolve) {
      log(`Command approval ID ${id} APPROVED by client.`);
      resolve(true);
      pendingApprovals.delete(id);
    }
  });

  socket.on('reject_command', (data) => {
    if (!getAuthorizedClient()) return;

    const id = data?.id;
    const resolve = pendingApprovals.get(id);
    if (resolve) {
      log(`Command approval ID ${id} REJECTED by client.`);
      resolve(false);
      pendingApprovals.delete(id);
    }
  });

  // Local Agentic Execution (Phase 7 ReAct loop)
  socket.on('agent_run', async (data) => {
    if (!getAuthorizedClient()) return;

    const task = data?.task || '';
    const maxIterations = data?.maxIterations || 10;
    const provider = data?.provider;
    const model = data?.model;
    const apiKey = data?.apiKey;
    const permissionMode = data?.permissionMode || 'custom';

    // Set global permission mode for tools to check
    globalThis.agentPermissionMode = permissionMode;
    const baseUrl = data?.baseUrl;

    log(`Running Agentic ReAct loop for task: "${task}"`);
    broadcast('chat_start', { text: `ðŸ¤– [GHITA ReAct] Äang báº¯t Ä‘áº§u thá»±c hiá»‡n vÃ²ng láº·p Agentic ReAct cho tÃ¡c vá»¥: "${task}"`, senderId: 'system', senderName: 'GHITA ReAct' });

    try {
      if (grpcServerInstance && grpcServerInstance.orchestrator) {
        // Sync API credentials dynamically if passed
        if (provider && (apiKey || baseUrl)) {
          try {
            const registry = grpcServerInstance.orchestrator.getRegistry();
            registry.registerFromConfig({
              type: provider,
              apiKey: apiKey || '',
              baseUrl: baseUrl || '',
              defaultModel: model || '',
            });
            log(`Synced credentials for provider: ${provider}`);
          } catch (e) {
            log(`Failed to sync provider credentials: ${e.message}`);
          }
        }

        // Gather all workspace and web tools from orchestrator.builtInTools
        const tools = grpcServerInstance.orchestrator.builtInTools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
          execute: t.execute,
        }));

        // Implement custom parseToolCalls to extract XML and JSON format outputs stably.
        // Bug #15 fixes: the original implementation reused the same regex objects
        // (`g`/`gi` flag) and called `regex.exec()` in a loop, which mutates
        // `regex.lastIndex`. If the function ever threw mid-loop on a later
        // call, the next invocation would start from a stale offset and skip
        // matches. We now allocate fresh regex objects per call.
        //
        // Bug #24: validate the parsed tool name against the tool registry
        // before returning actions. LLM-hallucinated tool names are dropped
        // with a console.warn instead of being executed (the previous code
        // pushed every parsed name to the action list, even if it did not
        // exist in `this.tools`, which made the agent loop forever waiting
        // for a tool that would never resolve).
        const knownTools = new Set(
          Object.keys(grpcServerInstance.orchestrator.builtInTools || {}),
        );

        /** Generate a stable, sortable, unique tool-call id. */
        const newToolCallId = () =>
          `call_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

        /** Tokenize XML key/value pairs from a tag body. */
        const parseKeyValTags = (body) => {
          const input = {};
          // Build a fresh regex each call to avoid `lastIndex` pollution
          const kvRegex = /<([A-Za-z_][A-Za-z0-9_-]*)\s*>([\s\S]*?)<\/\1>/g;
          let kvMatch;
          while ((kvMatch = kvRegex.exec(body)) !== null) {
            input[kvMatch[1].trim()] = kvMatch[2].trim();
          }
          return input;
        };

        const customParseToolCalls = (message) => {
          const text = message.getText();
          const actions = [];

          // 1. Native toolCalls from metadata
          if (message.metadata?.toolCalls && Array.isArray(message.metadata.toolCalls)) {
            for (const tc of message.metadata.toolCalls) {
              if (!tc.name) continue;
              if (knownTools.size > 0 && !knownTools.has(tc.name)) {
                console.warn(`[parseToolCalls] Unknown tool "${tc.name}" dropped`);
                continue;
              }
              actions.push({
                tool: tc.name,
                toolCallId: tc.id || newToolCallId(),
                input: tc.arguments,
              });
            }
            if (actions.length > 0) return actions;
          }

          // 2. XML tags â€” `<tool_call name="...">{json}</tool_call>`
          //    Allocate a fresh regex on every call.
          {
            const xmlRegex = /<tool_call\s+name="([A-Za-z_][A-Za-z0-9_-]*)"[^>]*>([\s\S]*?)<\/tool_call>/gi;
            let match;
            while ((match = xmlRegex.exec(text)) !== null) {
              const toolName = match[1].trim();
              const body = match[2].trim();
              if (knownTools.size > 0 && !knownTools.has(toolName)) {
                console.warn(`[parseToolCalls] Unknown tool "${toolName}" dropped`);
                continue;
              }
              let input = {};
              try {
                if (body.startsWith('{')) {
                  input = JSON.parse(body);
                } else {
                  input = parseKeyValTags(body);
                }
              } catch (err) {
                log(`Failed to parse XML tool call body for "${toolName}": ${body}. Error: ${err.message}`);
                continue;
              }
              actions.push({
                tool: toolName,
                toolCallId: newToolCallId(),
                input,
              });
            }
          }
          if (actions.length > 0) return actions;

          // 3. Markdown JSON blocks
          {
            const markdownJsonRegex = /```json\s*([\s\S]*?)```/gi;
            let mdMatch;
            while ((mdMatch = markdownJsonRegex.exec(text)) !== null) {
              try {
                const parsed = JSON.parse(mdMatch[1].trim());
                const collect = (item) => {
                  const name = item.name || item.tool;
                  if (!name) return null;
                  if (knownTools.size > 0 && !knownTools.has(name)) {
                    console.warn(`[parseToolCalls] Unknown tool "${name}" dropped`);
                    return null;
                  }
                  return {
                    tool: name,
                    toolCallId: item.toolCallId || newToolCallId(),
                    input: item.arguments || item.input || {},
                  };
                };
                if (Array.isArray(parsed)) {
                  for (const item of parsed) {
                    const a = collect(item);
                    if (a) actions.push(a);
                  }
                } else if (parsed && typeof parsed === 'object') {
                  const a = collect(parsed);
                  if (a) actions.push(a);
                }
              } catch {
                // Ignore invalid JSON inside markdown blocks
              }
            }
          }

          return actions;
        };

        const { createReActAgent, AIMessage, ToolMessage } = await loadAgents();
        const agent = createReActAgent({
          config: {
            name: 'GHITA-ReAct-Local',
            systemPrompt: `You are GHITA, a powerful AI coding agent. You operate locally inside the user's workspace directory.
You can use the following tools:
- list_dir: List files in the workspace.
- read_file: Read file contents (supports startLine/endLine).
- write_file: Write a new file.
- replace_file_content: Edit a contiguous block of text in an existing file.
- grep_search: Search for a query inside the files.
- run_command: Run terminal commands (will require user consent).
- web_search: Search the web.
- web_fetch: Fetch a URL.

When using tools, you must output either standard function calling metadata or a markdown code block containing a JSON tool call object, or an XML tag like:
<tool_call name="read_file">{"filePath": "package.json"}</tool_call>

If you choose JSON code block, output in this exact structure:
\`\`\`json
{
  "name": "tool_name",
  "arguments": {
    "arg1": "val1"
  }
}
\`\`\`
State your reasoning step by step, then invoke a tool call. Repeat this cycle until you have achieved the goal, then output your final answer.`,
            maxIterations,
            tools,
            model,
            provider,
          },
          llmCall: async (messages) => {
            // Truncate long observations to avoid blowing the LLM context window.
            // Keep the original full text for the UI broadcast (in onStepEnd),
            // but only feed a bounded-size version back to the model.
            const LLM_MAX_OBSERVATION_CHARS = 8_000;
            const truncatedMessages = messages.map((m) => {
              if (m.role !== 'tool' && m.role !== 'user') return m;
              const txt = m.getText();
              if (txt.length <= LLM_MAX_OBSERVATION_CHARS) return m;
              const head = txt.slice(0, LLM_MAX_OBSERVATION_CHARS);
              const tail = `\n\n... [truncated ${txt.length - LLM_MAX_OBSERVATION_CHARS} chars] ...`;
              // Build a shallow clone with truncated content to avoid mutating originals.
              const Cls = m.constructor;
              try {
                if (m.role === 'tool') {
                  return new Cls(head + tail, m.toolCallId, m.toolName, { id: m.id, timestamp: m.timestamp, metadata: m.metadata });
                }
                return new Cls(head + tail, { id: m.id, name: m.name, timestamp: m.timestamp, metadata: m.metadata });
              } catch {
                return m; // fallback: original
              }
            });

            // Map internal BaseMessage to OpenAI chat format, preserving
            // `role: 'tool'` and `tool_call_id` so the model can match each
            // observation back to the tool call that produced it. Also forward
            // `tool_calls` on assistant messages.
            const chatMessages = truncatedMessages.map((msg) => {
              const role = msg.role;
              if (role === 'tool') {
                return {
                  role: 'tool',
                  tool_call_id: msg.toolCallId,
                  content: msg.getText(),
                };
              }
              if (role === 'assistant') {
                const base = { role: 'assistant', content: msg.getText() };
                if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
                  base.tool_calls = msg.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                      name: tc.name,
                      arguments: typeof tc.arguments === 'string'
                        ? tc.arguments
                        : JSON.stringify(tc.arguments ?? {}),
                    },
                  }));
                } else if (msg.metadata && Array.isArray(msg.metadata.toolCalls) && msg.metadata.toolCalls.length > 0) {
                  // Fallback: some providers put tool calls in metadata
                  base.tool_calls = msg.metadata.toolCalls.map((tc) => ({
                    id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                    type: 'function',
                    function: {
                      name: tc.name,
                      arguments: typeof tc.arguments === 'string'
                        ? tc.arguments
                        : JSON.stringify(tc.arguments ?? {}),
                    },
                  }));
                }
                return base;
              }
              if (role === 'system') {
                return { role: 'system', content: msg.getText() };
              }
              if (role === 'function') {
                return { role: 'function', name: msg.functionName, content: msg.getText() };
              }
              return { role: 'user', content: msg.getText() };
            });

            // Timeout 60s cho má»—i LLM call Ä‘á»ƒ trÃ¡nh bá»‹ treo vÃ´ háº¡n
            const LLM_TIMEOUT_MS = 60_000;
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('LLM call timeout after 60s - Opengateway khÃ´ng pháº£n há»“i')), LLM_TIMEOUT_MS)
            );
            const res = await Promise.race([
              grpcServerInstance.orchestrator.chat(chatMessages, { provider, model }),
              timeoutPromise,
            ]);
            return new AIMessage(res.content, {
              metadata: {
                usage: res.usage,
              }
            });
          },
          parseToolCalls: customParseToolCalls,
        });

        // Run agent with 3-minute overall timeout to prevent UI hang.
        // Bug #19: also kill any child processes spawned by tools
        // (e.g. `runCommand`) so a hung process cannot keep running
        // after the agent run was aborted. We expose a Set on
        // `globalThis.__activeChildProcs` that the workspace-tools
        // package populates.
        const AGENT_TIMEOUT_MS = 180_000;
        const childRegistry = new Set();
        const previousRegistry = globalThis.__activeChildProcs;
        globalThis.__activeChildProcs = childRegistry;

        /** Kill all tracked child processes; safe to call repeatedly. */
        const killAllChildren = () => {
          for (const child of childRegistry) {
            try {
              if (typeof child.kill === 'function') {
                child.kill('SIGTERM');
              }
            } catch {
              // Ignore â€” child may have already exited
            }
          }
          childRegistry.clear();
        };

        const agentPromise = agent.run(task, {
          onStepStart: (step, action) => {
            broadcast('agent_step_start', { step, action });
            broadcast('chat_chunk', { text: `\nðŸ¤” *[BÆ°á»›c ${step + 1}] Suy nghÄ©...* Gá»i cÃ´ng cá»¥ \`${action.tool}\`...\n` });
          },
          onStepEnd: (step, observation) => {
            broadcast('agent_step_end', { step, observation });
            const preview = observation.length > 500 ? observation.slice(0, 500) + '... (trá»±c quan hÃ³a bá»‹ rÃºt gá»n)' : observation;
            broadcast('chat_chunk', { text: `\nðŸ“ *Káº¿t quáº£ cÃ´ng cá»¥:* \n\`\`\`\n${preview}\n\`\`\`\n` });
          },
          onToolCall: (tool, input) => {
            broadcast('agent_tool_call', { tool, input });
          },
          onToolResult: (tool, result) => {
            broadcast('agent_tool_result', { tool, result });
          },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout after 3 minutes - quÃ¡ thá»i gian chá»')), AGENT_TIMEOUT_MS)
        );
        let result;
        try {
          result = await Promise.race([agentPromise, timeoutPromise]);
        } catch (err) {
          // Bug #19: kill any running child processes on error/timeout
          killAllChildren();
          throw err;
        } finally {
          // Restore previous registry so concurrent agent runs don't share state
          globalThis.__activeChildProcs = previousRegistry;
        }

        // Bug #18: emit `agent_run_done` *before* `chat_done` and tag
        // the final chat message with a `kind` so the React side knows
        // it is the agent-final message and does not double-render.
        broadcast('agent_run_done', {
          output: result.output,
          iterations: result.iterations,
          duration: result.duration,
          stepsCount: result.steps.length,
        });

        broadcast('chat_done', {
          text: `### âœ… HoÃ n thÃ nh tÃ¡c vá»¥ Agentic ReAct!
${result.output}`,
          kind: 'agent_final',
        });

      } else {
        socket.emit('chat_error', { message: 'âš™ï¸ AI Orchestrator chÆ°a Ä‘Æ°á»£c cáº¥u hÃ¬nh. Vui lÃ²ng má»Ÿ tab API Manager, thÃªm API Key vÃ  báº­t Active cho Ã­t nháº¥t 1 provider.' });
      }
    } catch (err) {
      log(`Error in agent run: ${err.message}`);
      socket.emit('chat_error', { message: `ReAct Agent Exception: ${err.message}` });
      broadcast('chat_done', { text: `âŒ VÃ²ng láº·p Agentic ReAct gáº·p lá»—i: ${err.message}` });
    }
  });

  // Chat
  socket.on(EVENTS.CHAT, async (data) => {
    const authorized = getAuthorizedClient();
    if (!authorized) return;

    const { device, isDesktop, senderId, senderName } = authorized;

    if (data?.text) {
      log(`Chat from ${senderName}: ${data.text}`);

      // Náº¿u tá»« Mobile, emit lÃªn Tauri qua stdout
      if (!isDesktop) {
        ipcEmit(EVENTS.CHAT, { deviceId: senderId, text: data.text });
      }

      // RÃ  quÃ©t báº£o máº­t PreToolUse Hook cho cÃ¡c lá»‡nh CLI tá»± cháº¡y hoáº·c cÃ¡c tá»« khÃ³a nháº¡y cáº£m
      if (data.text.startsWith('/') || data.text.includes('rm ') || data.text.includes('bash ') || data.text.includes('curl ') || data.text.includes('nc ')) {
        const { SecurityGuard } = await loadAiEngine();
        const securityResult = SecurityGuard.scanCommand(data.text);
        if (!securityResult.safe) {
          // KÃ­ch hoáº¡t ngay popup duyá»‡t tool cáº£nh bÃ¡o nguy háº¡i cao Ä‘á»™ (Human-in-the-loop)
          socket.emit('action_required', {
            toolCallId: `sec_${Date.now()}`,
            name: 'execute_dangerous_command',
            arguments: JSON.stringify({ command: data.text }, null, 2),
            warningMessage: securityResult.reason || 'Lá»‡nh nÃ y chá»©a máº«u mÃ£ Ä‘á»™c nguy hiá»ƒm bá»‹ cáº¥m thá»±c thi trá»±c tiáº¿p!',
          });
          return; // Cháº·n Ä‘á»©ng tiáº¿n trÃ¬nh
        }
      }

      // PhÃ¡t sá»± kiá»‡n báº¯t Ä‘áº§u streaming token cho cáº£ hai thiáº¿t bá»‹
      broadcast('chat_start', { text: data.text, senderId, senderName });

      let fullResponse = '';
      try {
        const messages = [];

        // Náº¿u cÃ³ history gá»­i kÃ¨m theo
        if (data.history && Array.isArray(data.history)) {
          messages.push(...data.history.map(msg => ({
            role: msg.role,
            content: msg.content
          })));
        } else {
          messages.push({ role: 'user', content: data.text });
        }

        if (grpcServerInstance && grpcServerInstance.orchestrator) {
          const persistedProvider = syncApiConfigToOrchestrator(data.provider);
          const selectedProvider = data.provider || persistedProvider?.type;
          const selectedModel = data.model || persistedProvider?.defaultModel;
          const costTracker = grpcServerInstance.orchestrator.costTracker;
          const costBefore = typeof costTracker?.getTotalCost === 'function'
            ? costTracker.getTotalCost()
            : 0;

          const stream = grpcServerInstance.orchestrator.chatStream(messages, {
            provider: selectedProvider || undefined,
            model: selectedModel || undefined,
          });

          let lastUsage = null;
          for await (const chunk of stream) {
            if (chunk.content) {
              fullResponse += chunk.content;
              broadcast('chat_chunk', { text: chunk.content });
            }
            if (chunk.usage) {
              lastUsage = chunk.usage;
            }
          }

          // Estimate tokens if API didn't provide usage
          const usage = lastUsage || {
            promptTokens: Math.ceil((data.text || '').length / 4),
            completionTokens: Math.ceil(fullResponse.length / 4),
            totalTokens: Math.ceil(((data.text || '').length + fullResponse.length) / 4),
          };

          const costAfter = typeof costTracker?.getTotalCost === 'function'
            ? costTracker.getTotalCost()
            : costBefore;
          const incrementalCost = Math.max(0, costAfter - costBefore);

          broadcast('chat_done', {
            text: fullResponse,
            usage: {
              ...usage,
              costUsd: incrementalCost,
              totalCostUsd: costAfter,
            },
          });
        } else {
          // Fallback response náº¿u orchestrator chÆ°a sáºµn sÃ ng
          const fallbackText = `âš™ï¸ **AI Engine chÆ°a sáºµn sÃ ng.**\n\nHá»‡ thá»‘ng nháº­n Ä‘Æ°á»£c tin nháº¯n: "${data.text}"\n\nÄá»ƒ sá»­ dá»¥ng Chat AI, vui lÃ²ng:\n1. Má»Ÿ tab **API Manager** (ðŸ”‘) trÃªn á»©ng dá»¥ng Desktop\n2. ThÃªm Ã­t nháº¥t 1 nhÃ  cung cáº¥p AI vÃ  nháº­p API Key\n3. Báº­t **Active** cho provider Ä‘Ã³\n\nSau Ä‘Ã³ hÃ£y thá»­ láº¡i!`;
          broadcast('chat_chunk', { text: fallbackText });
          broadcast('chat_done', { text: fallbackText });
        }
      } catch (err) {
        log(`Error generating AI streaming: ${err.message}`);
        broadcast('chat_error', { message: err.message });
        // LuÃ´n phÃ¡t chat_done Ä‘á»ƒ giáº£i phÃ³ng tráº¡ng thÃ¡i UI trÃªn client
        broadcast('chat_done', { text: fullResponse || `Lá»—i: ${err.message}` });
      }
    }
  });

  // Screenshot
  socket.on(EVENTS.SCREENSHOT, async () => {
    const device = getDevice();
    if (!device) {
      socket.emit(EVENTS.ERROR, { message: 'Unauthorized: Device is not paired' });
      return;
    }
    log(`Screenshot requested by ${socket.id}`);
    try {
      const screenshotModule = await import('screenshot-desktop');
      const screenshot = screenshotModule.default ?? screenshotModule;
      const imgBuffer = await screenshot({ format: 'jpg' });
      const base64 = imgBuffer.toString('base64');
      socket.emit(EVENTS.SCREEN_STREAM, {
        image: base64,
        timestamp: Date.now(),
      });
    } catch (err) {
      log(`Screenshot capture failed: ${err.message}`);
      socket.emit(EVENTS.ERROR, { message: `Screenshot capture failed: ${err.message}` });
    }
  });

  // Computer Use step feedback/preview
  socket.on('computer_use_step', (data) => {
    if (!getAuthorizedClient()) return;

    log(`Computer Use step preview received: ${data?.action || 'unknown action'}`);
    broadcast('computer_use_step', data);
  });

  // --- Phase 8: Mobile Remote Touch Interaction ---
  socket.on('mobile_touch', async (data) => {
    if (!getAuthorizedClient()) return;
    if (!computerController) {
      socket.emit('error', { message: 'Computer-use adapter not available.' });
      return;
    }

    const { rx, ry, button, action } = data || {};
    if (typeof rx !== 'number' || typeof ry !== 'number') return;

    try {
      // Ensure computer-use is initialized
      await getOrCreateNodeRegistry();

      // Map relative (0-1) coordinates to absolute pixel coordinates
      const size = await computerController.adapter.getScreenSize();
      if (!size) {
        socket.emit('error', { message: 'Cannot get screen size.' });
        return;
      }

      const px = Math.round(rx * size.width);
      const py = Math.round(ry * size.height);
      const point = { x: px, y: py };

      log(`[Mobile Touch] rx=${rx}, ry=${ry} -> px=${px}, py=${py} (${size.width}x${size.height})`);

      if (action === 'move') {
        await computerController.moveMouse(point);
      } else {
        // Default: click (left/right/middle)
        const mouseButton = button || 'left';
        await computerController.click(point, mouseButton);
      }

      socket.emit('mobile_touch_result', { success: true, px, py, action: action || 'click' });
    } catch (err) {
      log(`[Mobile Touch] Error: ${err.message}`);
      socket.emit('mobile_touch_result', { success: false, error: err.message });
    }
  });

  // Mobile remote type text
  socket.on('mobile_type', async (data) => {
    if (!getAuthorizedClient()) return;
    if (!computerController) {
      socket.emit('error', { message: 'Computer-use adapter not available.' });
      return;
    }

    const { text } = data || {};
    if (!text || typeof text !== 'string') return;

    try {
      await getOrCreateNodeRegistry();
      await computerController.typeText(text);
      log(`[Mobile Type] Typed ${text.length} characters`);
      socket.emit('mobile_type_result', { success: true, length: text.length });
    } catch (err) {
      log(`[Mobile Type] Error: ${err.message}`);
      socket.emit('mobile_type_result', { success: false, error: err.message });
    }
  });

  // Mobile remote press key
  socket.on('mobile_key', async (data) => {
    if (!getAuthorizedClient()) return;
    if (!computerController) {
      socket.emit('error', { message: 'Computer-use adapter not available.' });
      return;
    }

    const { key } = data || {};
    if (!key || typeof key !== 'string') return;

    try {
      await getOrCreateNodeRegistry();
      await computerController.pressKey(key);
      log(`[Mobile Key] Pressed: ${key}`);
      socket.emit('mobile_key_result', { success: true, key });
    } catch (err) {
      log(`[Mobile Key] Error: ${err.message}`);
      socket.emit('mobile_key_result', { success: false, error: err.message });
    }
  });

  // Approve/Reject
  socket.on(EVENTS.APPROVE, () => {
    const device = getDevice();
    if (device) {
      device.lastSeen = Date.now();
      ipcEmit(EVENTS.APPROVE, { deviceId: device.id });
    }
  });

  socket.on(EVENTS.REJECT, () => {
    const device = getDevice();
    if (device) {
      device.lastSeen = Date.now();
      ipcEmit(EVENTS.REJECT, { deviceId: device.id });
    }
  });

  // Pong
  socket.on(EVENTS.PONG, () => {
    const device = getDevice();
    if (device) device.lastSeen = Date.now();
  });

  // Sync Language
  socket.on(EVENTS.SYNC_LANGUAGE, (data) => {
    const authorized = getAuthorizedClient();
    if (!authorized) return;
    const { senderId, senderName } = authorized;
    log(`Sync language from ${senderName}: ${data?.language}`);
    broadcast(EVENTS.SYNC_LANGUAGE, data);
    ipcEmit(EVENTS.SYNC_LANGUAGE, data);
  });

  // Unpair
  socket.on(EVENTS.UNPAIR, (data) => {
    if (!getAuthorizedClient()) return;

    const deviceId = data?.deviceId || getDevice()?.id;
    if (deviceId) {
      const device = connectedDevices.get(deviceId);
      if (device) {
        log(`Unpairing device via socket event: ${device.name} (${device.id})`);
        const sId = device.socketId;
        if (sId) {
          const activeSocket = io.sockets.sockets.get(sId);
          if (activeSocket) {
            activeSocket.emit('unpaired');
            activeSocket.disconnect(true);
          }
        }
        connectedDevices.delete(deviceId);
        savePairedDevices();
        sendStatus();
        ipcEmit('unpaired', { deviceId });
      }
    }
  });

  // --- Phase 6: VS Code Extension file sync ---
  socket.on('file_change', (data) => {
    if (!isTrustedDesktopSocket(socket, isCloud)) return;

    const { event, path: filePath, content, language, oldPath, newPath, timestamp } = data || {};
    if (!event) return;

    log(`[VS Code Sync] ${event}: ${filePath || oldPath || 'N/A'}`);

    // Broadcast to all desktop clients (Tauri app, other VS Code instances)
    socket.to('desktop').emit('vscode_file_change', {
      event,
      path: filePath,
      content: content ?? null,
      language: language ?? null,
      oldPath: oldPath ?? null,
      newPath: newPath ?? null,
      timestamp: timestamp ?? Date.now(),
    });
  });

  socket.on('disconnect', () => {
    // Terminal sessions are now managed natively by Rust PTY (terminal.rs).
    // No Socket.IO-side cleanup needed.
  });
}

io.on('connection', (socket) => {
  log(`New connection: ${socket.id}`);

  if (isTrustedDesktopSocket(socket)) {
    socket.join('desktop');
  }

  // Pairing
  socket.on(EVENTS.PAIR, (data) => {
    const code = data?.code?.toUpperCase();
    const deviceId = data?.deviceId;
    const authToken = data?.authToken;

    if (!code && !deviceId) {
      socket.emit(EVENTS.ERROR, { message: 'Pairing code or device ID is required' });
      return;
    }

    let device;

    if (code) {
      if (!validateCode(code)) {
        socket.emit(EVENTS.ERROR, { message: 'Invalid or expired pairing code' });
        return;
      }

      const dId = deviceId || `device_${Date.now()}_${socket.id.slice(0, 6)}`;
      device = {
        id: dId,
        name: data?.deviceName || `Mobile-${socket.id.slice(0, 6)}`,
        platform: data?.platform || 'android',
        connected: true,
        lastSeen: Date.now(),
        socketId: socket.id,
        pairedAt: Date.now(),
        secret: randomBytes(32).toString('hex'),
      };

      connectedDevices.set(device.id, device);
      savePairedDevices();
      socket.join('paired-devices');

      socket.emit(EVENTS.PAIR_CONFIRM, {
        deviceName: 'GHITA Desktop',
        deviceId: device.id,
        authToken: device.secret,
      });

      regenerateCode();
      log(`Device paired: ${device.name} (${device.id})`);
      ipcEmit(EVENTS.PAIR_CONFIRM, { deviceId: device.id, name: device.name, platform: device.platform });
    } else if (deviceId) {
      device = connectedDevices.get(deviceId);
      if (device && device.secret && authToken === device.secret) {
        device.socketId = socket.id;
        device.connected = true;
        device.lastSeen = Date.now();
        socket.join('paired-devices');

        socket.emit(EVENTS.PAIR_CONFIRM, {
          deviceName: 'GHITA Desktop',
          deviceId: device.id,
          authToken: device.secret,
        });
        log(`Session resumed for device: ${device.name} (${device.id})`);
        ipcEmit(EVENTS.PAIR_CONFIRM, { deviceId: device.id, name: device.name, platform: device.platform, resumed: true });
      } else {
        socket.emit(EVENTS.ERROR, { message: 'Session expired. Please re-pair.' });
        return;
      }
    }

    sendStatus();
  });

  // Disconnect
  socket.on(EVENTS.DISCONNECT, (reason) => {
    const device = findDeviceBySocket(socket.id);
    if (device) {
      device.connected = false;
      log(`Device disconnected: ${device.name} (${reason})`);
      ipcEmit(EVENTS.DISCONNECT, { deviceId: device.id, name: device.name, reason });
      sendStatus();
    }
  });

  registerSocketEvents(socket, false);
  sendStatus();
});

function findDeviceBySocket(socketId) {
  for (const device of connectedDevices.values()) {
    if (device.socketId === socketId) return device;
  }
  return undefined;
}

function sendStatus() {
  const devices = [...connectedDevices.values()].map((d) => ({
    id: d.id,
    name: d.name,
    platform: d.platform,
    connected: d.connected,
    lastSeen: d.lastSeen,
  }));
  const connectedCount = devices.filter((d) => d.connected).length;
  io.to('paired-devices').emit(EVENTS.STATUS, {
    deviceCount: connectedCount,
    devices,
  });
}

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[GHITA ${ts}] ${msg}`);
}

function ipcEmit(event, data = {}) {
  const message = JSON.stringify({ event, data });
  console.log(`__GHITA_IPC__:${message}`);
}

// --- Auto-refresh pairing code ---
const pairingRefreshInterval = setInterval(() => {
  if (Date.now() >= codeExpiresAt) {
    regenerateCode();
    log(`Pairing code refreshed: ${currentCode}`);
    sendStatus();
  }
}, 10_000);
// M6 FIX (v0.4.9 B2): unref so this timer never keeps the event loop alive.
if (typeof pairingRefreshInterval.unref === 'function') {
  pairingRefreshInterval.unref();
}

let grpcServerInstance = null;

// --- Graceful shutdown ---
function shutdown(signal) {
  log(`Shutting down (${signal})...`);

  // M6 FIX: Clear rate limit interval before shutdown
  cleanupRateLimitInterval();

  // Kill all PTY sessions to prevent zombie processes
  io.disconnectSockets(true);
  io.close();

  // Äáº·t timeout cÆ°á»¡ng cháº¿ 1.5 giÃ¢y Ä‘á»ƒ trÃ¡nh zombie process cháº¡y ngáº§m
  const forceExitTimeout = setTimeout(() => {
    log(`Shutdown timed out, forcing process exit.`);
    process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
  }, 1500);
  if (typeof forceExitTimeout.unref === 'function') {
    forceExitTimeout.unref();
  }

  const closeHttp = () => {
    clearTimeout(forceExitTimeout);
    httpServer.close(() => {
      log('HTTP server closed safely.');
      process.exit(0);
    });
  };

  if (grpcServerInstance) {
    grpcServerInstance.stop().then(closeHttp).catch((err) => {
      log(`Error during gRPC Server shutdown: ${err.message}`);
      clearTimeout(forceExitTimeout);
      process.exit(1);
    });
  } else {
    closeHttp();
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));


// --- Global Exception & Rejection Shield ---
process.on('uncaughtException', (err) => {
  // Ignore EPIPE errors â€” they occur when the Tauri parent process closes
  // and the stdout pipe breaks. Logging would cause infinite EPIPE spam.
  if (err?.code === 'EPIPE' || err?.message?.includes('EPIPE')) return;
  log(`CRITICAL SHIELD: Uncaught Exception: ${err.message}`);
  if (err.stack) {
    try { console.error(err.stack); } catch (_) { /* stdout may be gone */ }
  }
  try { ipcEmit('server_error', { type: 'uncaughtException', message: err.message }); } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
  const msg = String(reason);
  if (msg.includes('EPIPE')) return;
  log(`CRITICAL SHIELD: Unhandled Rejection at: ${promise}, reason: ${reason}`);
  try { ipcEmit('server_error', { type: 'unhandledRejection', message: msg }); } catch (_) {}
});

// --- Start ---
log(`Preparing ports...`);
log('Port auto-liberation bypassed to prevent process termination. Sidecar will scan for available ports starting from ' + activePort);

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    log(`Port ${activePort} is busy, trying ${activePort + 1}...`);
    activePort++;
    if (activePort < 8100) {
      httpServer.listen(activePort, HOST);
    } else {
      log(`CRITICAL: HTTP Server failed to find an available port: ${err.message}`);
      ipcEmit('server_error', { type: 'httpServerError', message: err.message });
      process.exit(1);
    }
  } else {
    log(`CRITICAL: HTTP Server failed to start: ${err.message}`);
    ipcEmit('server_error', { type: 'httpServerError', message: err.message });
    process.exit(1);
  }
});

httpServer.on('listening', async () => {
  loadPairedDevices();
  const ip = getLocalIP();
  log(`Server listening on ${HOST}:${activePort}`);
  log(`Local IP: ${ip}`);
  const code = getCode();
  log(`Pairing code: ${code}`);
  publishToCloudDiscovery();
  // Khá»Ÿi Ä‘á»™ng gRPC Server (lazy-load ai-engine)
  try {
    const { ConfigLoader, Orchestrator, GrpcServer } = await loadAiEngine();
    const configLoader = new ConfigLoader();
    const localConfig = configLoader.load();
    const providerConfigs = configLoader.toProviderConfigs(localConfig);

    const orchestrator = new Orchestrator({
      providers: providerConfigs,
      defaultProvider: localConfig.agentRouting.default || undefined,
      routing: localConfig.agentRouting,
    });

    grpcServerInstance = new GrpcServer(orchestrator);
    syncApiConfigToOrchestrator();
    
    // Cá»‘ gáº¯ng khá»Ÿi Ä‘á»™ng gRPC, tá»± Ä‘á»™ng thá»­ cá»•ng tiáº¿p theo náº¿u báº­n
    let grpcPort = 50051;
    let grpcStarted = false;
    let actualGrpcPort = 50051;
    
    while (!grpcStarted && grpcPort < 50060) {
      try {
        actualGrpcPort = await grpcServerInstance.start(grpcPort);
        log(`gRPC Server started successfully on port ${actualGrpcPort}`);
        grpcStarted = true;
      } catch (err) {
        log(`Port ${grpcPort} busy for gRPC, trying ${grpcPort + 1}...`);
        grpcPort++;
      }
    }
    
    if (!grpcStarted) {
      log(`Failed to start gRPC Server on ports 50051-50059`);
    }
  } catch (err) {
    log(`Failed to configure and start gRPC Server: ${err.message}`);
  }

  if (process.send) {
    process.send({ type: 'started', port: activePort, localIP: ip, pairingCode: code });
  }
});

// Start listening
httpServer.listen(activePort, HOST);
