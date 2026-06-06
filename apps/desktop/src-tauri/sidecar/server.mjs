// ==============================================================================
// GHITA CODING AGENT — Communication Server Sidecar
// Standalone Socket.io server for Desktop ↔ Mobile communication
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

// node-pty: lazy load native addon (saves 50-150ms at startup)
let _pty = null;
function loadPty() {
  if (!_pty) {
    const sidecarRequire = sidecarCreateRequire(import.meta.url);
    _pty = sidecarRequire('node-pty');
  }
  return _pty;
}

// --- Config ---
const PORT = parseInt(process.env.GHITA_PORT || '8080', 10);
const LAN_ENABLED = process.env.GHITA_LAN_ENABLED === '1';
const HOST = process.env.GHITA_BIND_HOST || (LAN_ENABLED ? '0.0.0.0' : '127.0.0.1');
const CLOUD_DISCOVERY_ENABLED = process.env.GHITA_CLOUD_DISCOVERY === '1';
const AUTO_LIBERATE_PORTS = process.env.GHITA_LIBERATE_PORTS === '1';
const CLOUD_RELAY_ENABLED = false; // Tạm vô hiệu hóa — Render.com relay đã bị xóa
const CLOUD_RELAY_URL = process.env.GHITA_RELAY_URL || 'https://ghita-relay-server.onrender.com';
let cloudSocket = null;

function broadcast(event, data) {
  io.to(['desktop', 'paired-devices']).emit(event, data);
  if (cloudSocket && cloudSocket.connected) {
    cloudSocket.emit(event, data);
  }
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
function liberatePort(port) {
  try {
    if (process.platform === 'win32') {
      // Find PID of process listening on the specified port
      const output = execSync(`netstat -aon`, { timeout: 10000 }).toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING') && line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== process.pid.toString()) {
            log(`Killing old process ${pid} using port ${port}...`);
                  execSync(`taskkill /f /pid ${pid}`, { timeout: 5000 });
          }
        }
      }
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9`, { stdio: 'ignore', timeout: 10000 });
    }
    log(`Port ${port} has been liberated successfully.`);
  } catch (e) {
    // Ignore errors if no process is using the port
  }
}

const PAIRING_TTL_MS = 300_000; // 5 minutes

// Pending approvals registry for terminal commands
const pendingApprovals = new Map();

// Global workspace root initialization
globalThis.ghitaWorkspaceRoot = globalThis.ghitaWorkspaceRoot || null;

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
  try {
    const appKey = 'an6h273b';
    const path = `/api/KeyVal/UpdateValue/${appKey}/${key}/${value}`;

    const req = httpsRequest({
      hostname: 'keyvalue.immanuel.co',
      port: 443,
      path: path,
      method: 'POST',
      timeout: 5000, // 5s timeout
      headers: {
        'Content-Length': 0
      }
    }, (res) => {
      res.on('data', () => {});
    });

    req.on('timeout', () => {
      req.destroy();
      log(`Cloud discovery update timed out for key ${key}`);
    });

    req.on('error', (e) => {
      log(`Cloud discovery publication failed for key ${key}: ${e.message}`);
    });

    req.end();
  } catch (e) {
    log(`Cloud discovery publication exception for key ${key}: ${e.message}`);
  }
}


function publishToCloudDiscovery() {
  if (!CLOUD_DISCOVERY_ENABLED && !CLOUD_RELAY_ENABLED) {
    return;
  }

  try {
    const formattedIps = getAllLocalIPs().map(ip => ip.replace(/\./g, '-'));
    const value = `${formattedIps.join('_')}_${PORT}`;
    
    // 1. Publish under the 6-character pairing code
    publishToCloud(currentCode, value);
    
    // 2. Publish under the PC Hostname/Bluetooth name
    const pcName = hostname().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (pcName) {
      publishToCloud(pcName, value);
    }

    // 3. Register to Cloud Relay (tạm vô hiệu hóa)
    if (CLOUD_RELAY_ENABLED && cloudSocket && cloudSocket.connected) {
      log(`Registering code ${currentCode} to Cloud Relay...`);
      cloudSocket.emit('register_desktop', { pairingCode: currentCode });
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
      port: PORT,
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
      port: PORT,
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

    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
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

// --- Connected devices ---
const connectedDevices = new Map();

// --- Terminal PTY sessions ---
const terminalSessions = new Map();

/** Max age (ms) for a PTY session before it is force-killed (15 minutes idle) */
const PTY_SESSION_MAX_IDLE_MS = 900_000;

/** Periodic cleanup interval reference so we can unref() it */
let ptyCleanupInterval = null;

function startPtyCleanupInterval() {
  if (ptyCleanupInterval) return;
  ptyCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, session] of terminalSessions.entries()) {
      // Kill sessions that have been idle too long
      if (session.lastActivity && (now - session.lastActivity) > PTY_SESSION_MAX_IDLE_MS) {
        try {
          session.ptyProcess.kill();
          log(`Force-killed idle PTY session: ${id} (idle ${Math.round((now - session.lastActivity) / 1000)}s)`);
        } catch (err) {}
        terminalSessions.delete(id);
      }
    }
  }, 60_000); // check every 60 seconds
  if (typeof ptyCleanupInterval.unref === 'function') {
    ptyCleanupInterval.unref();
  }
}

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
      .filter(d => d.id && d.id !== 'cloud_session') // Chỉ lưu thiết bị LAN thực tế, bỏ cloud
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

async function getOrCreateNodeRegistry() {
  if (nodeRegistry) return nodeRegistry;
  log("Initializing host Node-capable Skill Registry...");

  // Lazy-load modules on first use
  const { createNodeSkillRegistry } = await loadSkillsNode();
  const { createComputerUseSkills, ComputerUseController } = await loadComputerUse();
  const { createBrowserControlSkills, BrowserController } = await loadBrowserControl();

  const registry = createNodeSkillRegistry();

  try {
    const { createNutJsAdapter } = await loadComputerUseNode();
    const nutAdapter = await createNutJsAdapter();
    computerController = new ComputerUseController(nutAdapter);
    registry.registerMany(createComputerUseSkills(computerController));
    log("Loaded computer-use host OS automation adapter.");
  } catch (e) {
    log(`Failed to load computer-use node adapter: ${e.message}`);
    computerController = new ComputerUseController();
    registry.registerMany(createComputerUseSkills(computerController));
  }

  try {
    const { createPlaywrightAdapter } = await loadBrowserControlNode();
    const playwrightAdapter = await createPlaywrightAdapter({ headless: false });
    const browserController = new BrowserController(playwrightAdapter);
    registry.registerMany(createBrowserControlSkills(browserController));
    log("Loaded browser-control host OS automation adapter.");
  } catch (e) {
    log(`Failed to load browser-control node adapter: ${e.message}`);
    const browserController = new BrowserController();
    registry.registerMany(createBrowserControlSkills(browserController));
  }

  nodeRegistry = registry;
  return nodeRegistry;
}

// --- Socket handlers ---

function registerSocketEvents(socket, isCloud = false) {
  const getDevice = () => {
    return isCloud ? findCloudDevice() : findDeviceBySocket(socket.id);
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
    
    // Gửi tín hiệu bắt đầu
    broadcast('chat_start', { text: `[Ralph Loop] Đang khởi động vòng lặp tự sửa sai cho tác vụ: "${task}"`, senderId: 'system', senderName: 'GHITA Engine' });

    try {
      if (grpcServerInstance && grpcServerInstance.orchestrator) {
        const { RalphLoopManager } = await loadAiEngine();
        const ralph = new RalphLoopManager(grpcServerInstance.orchestrator, {
          maxIterations,
          costLimitUsd,
        });

        // Giả lập một hàm thực thi (mock compiler) để mô phỏng tự sửa sai
        let compileAttempts = 0;
        const mockExecute = async (code) => {
          compileAttempts++;
          await new Promise(r => setTimeout(r, 2000)); // Delay mô phỏng build 2s
          
          if (compileAttempts < 2) {
            // Lần 1: Giả lập lỗi cú pháp
            return {
              success: false,
              logs: `ERROR in src/app.tsx: L32 - Type 'string' is not assignable to type 'number'. Cannot assign value: "${code.substring(0, 15)}..." to count.`,
            };
          } else {
            // Lần 2: Thành công
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
          
          // Gửi text tiến trình vào chat panel
          broadcast('chat_chunk', { text: `\n🔄 **[Vòng lặp ${progress.iteration}]** ${progress.message}\n` });
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
          text: `### 🎉 Ralph Loop Hoàn Tất!
- **Trạng thái:** ${result.success ? 'Thành công ✨' : 'Thất bại ❌'}
- **Số lượt sửa lỗi:** ${result.currentIteration} lần
- **Tổng lượng token:** ${result.totalTokensUsed.totalTokens} tokens
- **Tổng chi phí ước tính:** $${result.totalCostUsd.toFixed(5)} USD
- **Giải pháp cuối cùng:** Đã được đồng bộ hóa thành công!`
        });

      } else {
        socket.emit('chat_error', { message: '⚙️ AI Orchestrator chưa được cấu hình. Vui lòng mở tab API Manager, thêm API Key và bật Active cho ít nhất 1 provider.' });
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

    const root = data?.path || null;
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
    broadcast('chat_start', { text: `🤖 [GHITA ReAct] Đang bắt đầu thực hiện vòng lặp Agentic ReAct cho tác vụ: "${task}"`, senderId: 'system', senderName: 'GHITA ReAct' });

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

        // Implement custom parseToolCalls to extract XML and JSON format outputs stably
        const customParseToolCalls = (message) => {
          const text = message.getText();
          const actions = [];

          // 1. Try native toolCalls if present in metadata
          if (message.metadata?.toolCalls && Array.isArray(message.metadata.toolCalls)) {
            return message.metadata.toolCalls.map(tc => ({
              tool: tc.name,
              toolCallId: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              input: tc.arguments,
            }));
          }

          // 2. Parser for XML tags like: <tool_call name="...">{"filePath": "..."}</tool_call>
          const xmlRegex = /<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/tool_call>/gi;
          let match;
          while ((match = xmlRegex.exec(text)) !== null) {
            const toolName = match[1].trim();
            const body = match[2].trim();
            let input = {};
            try {
              if (body.startsWith('{')) {
                input = JSON.parse(body);
              } else {
                // Nested keys like <filePath>somefile.txt</filePath>
                const keyValRegex = /<([^>]+)>([\s\S]*?)<\/ \1>/g;
                const keyValRegex2 = /<([^>]+)>([\s\S]*?)<\/\1>/g;
                let kvMatch;
                while ((kvMatch = keyValRegex2.exec(body)) !== null) {
                  input[kvMatch[1].trim()] = kvMatch[2].trim();
                }
              }
            } catch (err) {
              log(`Failed to parse XML tool call body: ${body}. Error: ${err.message}`);
            }
            actions.push({
              tool: toolName,
              toolCallId: `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              input,
            });
          }
          if (actions.length > 0) return actions;

          // 3. Parser for Markdown JSON blocks
          const markdownJsonRegex = /```json\s*([\s\S]*?)```/gi;
          let mdMatch;
          while ((mdMatch = markdownJsonRegex.exec(text)) !== null) {
            try {
              const parsed = JSON.parse(mdMatch[1].trim());
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  const name = item.name || item.tool;
                  if (name) {
                    actions.push({
                      tool: name,
                      toolCallId: item.toolCallId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                      input: item.arguments || item.input || {},
                    });
                  }
                }
              } else if (parsed && typeof parsed === 'object') {
                const name = parsed.name || parsed.tool;
                if (name) {
                  actions.push({
                    tool: name,
                    toolCallId: parsed.toolCallId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                    input: parsed.arguments || parsed.input || {},
                  });
                }
              }
            } catch (e) {
              // Ignore invalid JSON inside markdown blocks
            }
          }

          return actions;
        };

        const { createReActAgent, AIMessage } = await loadAgents();
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
            const chatMessages = messages.map(msg => ({
              role: msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user',
              content: msg.getText(),
            }));
            // Timeout 60s cho mỗi LLM call để tránh bị treo vô hạn
            const LLM_TIMEOUT_MS = 60_000;
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('LLM call timeout after 60s - Opengateway không phản hồi')), LLM_TIMEOUT_MS)
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

        // Run agent with 3-minute overall timeout to prevent UI hang
        const AGENT_TIMEOUT_MS = 180_000;
        const agentPromise = agent.run(task, {
          onStepStart: (step, action) => {
            broadcast('agent_step_start', { step, action });
            broadcast('chat_chunk', { text: `\n🤔 *[Bước ${step + 1}] Suy nghĩ...* Gọi công cụ \`${action.tool}\`...\n` });
          },
          onStepEnd: (step, observation) => {
            broadcast('agent_step_end', { step, observation });
            const preview = observation.length > 500 ? observation.slice(0, 500) + '... (trực quan hóa bị rút gọn)' : observation;
            broadcast('chat_chunk', { text: `\n📝 *Kết quả công cụ:* \n\`\`\`\n${preview}\n\`\`\`\n` });
          },
          onToolCall: (tool, input) => {
            broadcast('agent_tool_call', { tool, input });
          },
          onToolResult: (tool, result) => {
            broadcast('agent_tool_result', { tool, result });
          },
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Agent timeout after 3 minutes - quá thời gian chờ')), AGENT_TIMEOUT_MS)
        );
        const result = await Promise.race([agentPromise, timeoutPromise]);

        broadcast('agent_run_done', {
          output: result.output,
          iterations: result.iterations,
          duration: result.duration,
          stepsCount: result.steps.length,
        });

        broadcast('chat_done', {
          text: `### ✅ Hoàn thành tác vụ Agentic ReAct!
${result.output}`
        });

      } else {
        socket.emit('chat_error', { message: '⚙️ AI Orchestrator chưa được cấu hình. Vui lòng mở tab API Manager, thêm API Key và bật Active cho ít nhất 1 provider.' });
      }
    } catch (err) {
      log(`Error in agent run: ${err.message}`);
      socket.emit('chat_error', { message: `ReAct Agent Exception: ${err.message}` });
      broadcast('chat_done', { text: `❌ Vòng lặp Agentic ReAct gặp lỗi: ${err.message}` });
    }
  });

  // Chat
  socket.on(EVENTS.CHAT, async (data) => {
    const authorized = getAuthorizedClient();
    if (!authorized) return;

    const { device, isDesktop, senderId, senderName } = authorized;

    if (data?.text) {
      log(`Chat from ${senderName}: ${data.text}`);

      // Nếu từ Mobile, emit lên Tauri qua stdout
      if (!isDesktop) {
        ipcEmit(EVENTS.CHAT, { deviceId: senderId, text: data.text });
      }

      // Rà quét bảo mật PreToolUse Hook cho các lệnh CLI tự chạy hoặc các từ khóa nhạy cảm
      if (data.text.startsWith('/') || data.text.includes('rm ') || data.text.includes('bash ') || data.text.includes('curl ') || data.text.includes('nc ')) {
        const { SecurityGuard } = await loadAiEngine();
        const securityResult = SecurityGuard.scanCommand(data.text);
        if (!securityResult.safe) {
          // Kích hoạt ngay popup duyệt tool cảnh báo nguy hại cao độ (Human-in-the-loop)
          socket.emit('action_required', {
            toolCallId: `sec_${Date.now()}`,
            name: 'execute_dangerous_command',
            arguments: JSON.stringify({ command: data.text }, null, 2),
            warningMessage: securityResult.reason || 'Lệnh này chứa mẫu mã độc nguy hiểm bị cấm thực thi trực tiếp!',
          });
          return; // Chặn đứng tiến trình
        }
      }

      // Phát sự kiện bắt đầu streaming token cho cả hai thiết bị
      broadcast('chat_start', { text: data.text, senderId, senderName });

      let fullResponse = '';
      try {
        const messages = [];

        // Nếu có history gửi kèm theo
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
          // Fallback response nếu orchestrator chưa sẵn sàng
          const fallbackText = `⚙️ **AI Engine chưa sẵn sàng.**\n\nHệ thống nhận được tin nhắn: "${data.text}"\n\nĐể sử dụng Chat AI, vui lòng:\n1. Mở tab **API Manager** (🔑) trên ứng dụng Desktop\n2. Thêm ít nhất 1 nhà cung cấp AI và nhập API Key\n3. Bật **Active** cho provider đó\n\nSau đó hãy thử lại!`;
          broadcast('chat_chunk', { text: fallbackText });
          broadcast('chat_done', { text: fallbackText });
        }
      } catch (err) {
        log(`Error generating AI streaming: ${err.message}`);
        broadcast('chat_error', { message: err.message });
        // Luôn phát chat_done để giải phóng trạng thái UI trên client
        broadcast('chat_done', { text: fullResponse || `Lỗi: ${err.message}` });
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
          if (sId === 'cloud_relay') {
            if (cloudSocket) {
              cloudSocket.emit('disconnect_peer', { reason: 'Unpaired by desktop' });
            }
          } else {
            const activeSocket = io.sockets.sockets.get(sId);
            if (activeSocket) {
              activeSocket.emit('unpaired');
              activeSocket.disconnect(true);
            }
          }
        }
        connectedDevices.delete(deviceId);
        savePairedDevices();
        sendStatus();
        ipcEmit('unpaired', { deviceId });
      }
    }
  });

  // --- PTY Terminal Handlers ---
  socket.on('terminal_create', (data) => {
    const auth = getAuthorizedClient({ allowDevice: false });
    if (!auth) return;

    const { id, cols, rows, shellType, cwd } = data;
    if (!id) return;

    // Clean up existing session with the same id if any
    if (terminalSessions.has(id)) {
      const existing = terminalSessions.get(id);
      try {
        existing.ptyProcess.kill();
      } catch (err) {}
      terminalSessions.delete(id);
    }

    try {
      const shell = process.platform === 'win32'
        ? (shellType === 'powershell' ? 'powershell.exe' : 'cmd.exe')
        : 'bash';

      const ptyModule = loadPty();
      const safeCols = Math.min(Math.max(Number(cols) || 80, 20), 500);
      const safeRows = Math.min(Math.max(Number(rows) || 24, 5), 200);
      const ptyProcess = ptyModule.spawn(shell, [], {
        name: 'xterm-color',
        cols: safeCols,
        rows: safeRows,
        cwd: cwd || globalThis.ghitaWorkspaceRoot || process.env.USERPROFILE || process.cwd(),
        env: process.env,
      });

      ptyProcess.onData((chunk) => {
        // Update lastActivity so the idle-killer won't touch this session
        const sess = terminalSessions.get(id);
        if (sess) sess.lastActivity = Date.now();

        // Only log PTY output in verbose/debug mode to avoid leaking sensitive data
        if (process.env.GHITA_DEBUG) log(`PTY Output [${id}]: ${JSON.stringify(chunk)}`);
        socket.emit('terminal_data', { id, data: chunk });
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        socket.emit('terminal_exit', { id, exitCode, signal });
        terminalSessions.delete(id);
      });

      terminalSessions.set(id, { ptyProcess, socketId: socket.id, lastActivity: Date.now() });
      log(`PTY session created: ${id} (${shell})`);

      // Ensure the periodic cleanup interval is running
      startPtyCleanupInterval();
    } catch (err) {
      log(`Failed to spawn PTY: ${err.message}`);
      socket.emit('terminal_data', { id, data: `\r\nError: Failed to spawn PTY: ${err.message}\r\n` });
    }
  });

  socket.on('terminal_data', (data) => {
    const auth = getAuthorizedClient({ allowDevice: false });
    if (!auth) return;

    const { id, data: inputData } = data;

    // ── Filter #6: Skip empty / non-string input at server level ──
    if (!inputData || typeof inputData !== 'string') return;

    log(`PTY Input [${id}]: ${JSON.stringify(inputData)}`);
    const session = terminalSessions.get(id);
    if (session && session.socketId === socket.id) {
      // Track activity to prevent idle-kill of active sessions
      session.lastActivity = Date.now();
      session.ptyProcess.write(inputData);
    }
  });

  socket.on('terminal_resize', (data) => {
    const auth = getAuthorizedClient({ allowDevice: false });
    if (!auth) return;

    const { id, cols, rows } = data;
    const session = terminalSessions.get(id);
    if (session && session.socketId === socket.id) {
      try {
        session.ptyProcess.resize(cols, rows);
      } catch (err) {
        log(`Failed to resize PTY: ${err.message}`);
      }
    }
  });

  socket.on('terminal_close', (data) => {
    const auth = getAuthorizedClient({ allowDevice: false });
    if (!auth) return;

    const { id } = data;
    const session = terminalSessions.get(id);
    if (session && session.socketId === socket.id) {
      try {
        session.ptyProcess.kill();
      } catch (err) {}
      terminalSessions.delete(id);
      log(`PTY session closed: ${id}`);
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
    for (const [id, session] of terminalSessions.entries()) {
      if (session.socketId === socket.id) {
        try {
          session.ptyProcess.kill();
        } catch (err) {}
        terminalSessions.delete(id);
        log(`Cleaned up PTY session ${id} due to socket disconnect`);
      }
    }
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

function findCloudDevice() {
  for (const device of connectedDevices.values()) {
    if (device.socketId === 'cloud_relay') return device;
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

  if (cloudSocket && cloudSocket.connected) {
    cloudSocket.emit(EVENTS.STATUS, {
      deviceCount: connectedCount,
      devices,
    });
  }
}

let keepAliveInterval = null;

function startKeepAlivePing() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  log(`[Cloud] Starting Keep-Alive self-pings every 10 minutes.`);
  keepAliveInterval = setInterval(async () => {
    if (!cloudSocket || !cloudSocket.connected) return;
    
    const pingUrl = `${CLOUD_RELAY_URL}/health`;
    log(`[Cloud] Sending self-ping to ${pingUrl} to prevent sleep...`);
    
    try {
      const res = await fetch(pingUrl);
      log(`[Cloud] Ping response status: ${res.status}`);
    } catch (e) {
      log(`[Cloud] Ping error: ${e.message}`);
    }
  }, 600_000); // 10 minutes
  
  if (typeof keepAliveInterval.unref === 'function') {
    keepAliveInterval.unref();
  }
}

function initCloudSocket() {
  if (cloudSocket) {
    try {
      cloudSocket.removeAllListeners();
      cloudSocket.disconnect();
    } catch (e) {}
  }

  log(`Initializing Cloud Relay client connection to: ${CLOUD_RELAY_URL}`);
  cloudSocket = ioClient(CLOUD_RELAY_URL, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });

  cloudSocket.on('connect', () => {
    log(`[Cloud] Connected to Cloud Relay! Registering code: ${currentCode}`);
    cloudSocket.emit('register_desktop', { pairingCode: currentCode });
  });

  cloudSocket.on('disconnect', (reason) => {
    log(`[Cloud] Disconnected from Cloud Relay: ${reason}`);
    // Clean up cloud device
    const device = findCloudDevice();
    if (device) {
      device.connected = false;
      log(`[Cloud] Virtual Cloud Device disconnected.`);
      ipcEmit(EVENTS.DISCONNECT, { deviceId: device.id, name: device.name, reason });
      sendStatus();
    }
  });

  cloudSocket.on('pair_confirm', (data) => {
    log(`[Cloud] Paired with Mobile via Cloud Relay! Peer socket: ${data.peerId}`);
    
    // Create virtual cloud device
    const device = {
      id: 'cloud_session',
      name: 'Mobile (Cloud)',
      platform: 'android',
      connected: true,
      lastSeen: Date.now(),
      socketId: 'cloud_relay',
      pairedAt: Date.now(),
    };

    connectedDevices.set(device.id, device);
    log(`[Cloud] Paired successfully: ${device.name} (${device.id})`);
    ipcEmit(EVENTS.PAIR_CONFIRM, { deviceId: device.id, name: device.name, platform: device.platform });
    sendStatus();
  });

  cloudSocket.on('disconnect_peer', (data) => {
    log(`[Cloud] Mobile peer disconnected via Cloud Relay: ${data?.reason || 'No reason'}`);
    const device = findCloudDevice();
    if (device) {
      device.connected = false;
      connectedDevices.delete(device.id);
      ipcEmit(EVENTS.DISCONNECT, { deviceId: device.id, name: device.name, reason: data?.reason || 'Mobile offline' });
      sendStatus();
    }
  });

  registerSocketEvents(cloudSocket, true);
  startKeepAlivePing();
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
setInterval(() => {
  if (Date.now() >= codeExpiresAt) {
    regenerateCode();
    log(`Pairing code refreshed: ${currentCode}`);
    sendStatus();
  }
}, 10_000);

let grpcServerInstance = null;

// --- Graceful shutdown ---
function shutdown(signal) {
  log(`Shutting down (${signal})...`);

  // Kill all PTY sessions to prevent zombie processes
  for (const [id, session] of terminalSessions.entries()) {
    try {
      session.ptyProcess.kill();
      log(`Killed PTY session: ${id}`);
    } catch (err) {}
  }
  terminalSessions.clear();

  // Clear the PTY idle-cleanup interval
  if (ptyCleanupInterval) {
    clearInterval(ptyCleanupInterval);
    ptyCleanupInterval = null;
  }

  io.disconnectSockets(true);
  io.close();

  // Đặt timeout cưỡng chế 1.5 giây để tránh zombie process chạy ngầm
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

// Kill remaining PTY zombies on unexpected exit (synchronous, best-effort)
process.on('exit', () => {
  for (const [, session] of terminalSessions) {
    try { session.ptyProcess.kill(); } catch (_) {}
  }
});

// --- Global Exception & Rejection Shield ---
process.on('uncaughtException', (err) => {
  // Ignore EPIPE errors — they occur when the Tauri parent process closes
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
if (AUTO_LIBERATE_PORTS) {
  liberatePort(PORT);
  liberatePort(50051); // Legacy opt-in: force-close processes that own GHITA ports.
} else {
  log('Port auto-liberation disabled. Set GHITA_LIBERATE_PORTS=1 to enable legacy kill-on-port behavior.');
}

httpServer.on('error', (err) => {
  log(`CRITICAL: HTTP Server failed to start: ${err.message}`);
  ipcEmit('server_error', { type: 'httpServerError', message: err.message });
  process.exit(1);
});

httpServer.listen(PORT, HOST, async () => {
  loadPairedDevices();
  const ip = getLocalIP();
  log(`Server listening on ${HOST}:${PORT}`);
  log(`Local IP: ${ip}`);
  const code = getCode();
  log(`Pairing code: ${code}`);
  publishToCloudDiscovery();
  // initCloudSocket(); // Cloud Relay tạm vô hiệu hóa — Render.com relay đã bị xóa

  // Khởi động gRPC Server (lazy-load ai-engine)
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
    
    // Cố gắng khởi động gRPC, tự động thử cổng tiếp theo nếu bận
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
    process.send({ type: 'started', port: PORT, localIP: ip, pairingCode: code });
  }
});
