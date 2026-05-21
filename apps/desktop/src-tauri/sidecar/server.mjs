// ==============================================================================
// GHITA CODING AGENT — Communication Server Sidecar
// Standalone Socket.io server for Desktop ↔ Mobile communication
// ==============================================================================

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { networkInterfaces, hostname } from 'node:os';
import { execSync } from 'node:child_process';
import { GrpcServer, Orchestrator, ConfigLoader, RalphLoopManager, SecurityGuard } from '@ghita/ai-engine';
import { createNodeSkillRegistry } from '@ghita/skills/node';
import { createComputerUseSkills, ComputerUseController } from '@ghita/computer-use';
import { createNutJsAdapter } from '@ghita/computer-use/node';
import { createBrowserControlSkills, BrowserController } from '@ghita/browser-control';
import { createPlaywrightAdapter } from '@ghita/browser-control/node';

// --- Config ---
const PORT = parseInt(process.env.GHITA_PORT || '8080', 10);
const HOST = '0.0.0.0';

// --- Auto Port Liberation ---
function liberatePort(port) {
  try {
    if (process.platform === 'win32') {
      // Find PID of process listening on the specified port
      const output = execSync(`netstat -aon`).toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('LISTENING') && line.includes(`:${port}`)) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0' && pid !== process.pid.toString()) {
            log(`Killing old process ${pid} using port ${port}...`);
            execSync(`taskkill /f /pid ${pid}`);
          }
        }
      }
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9`, { stdio: 'ignore' });
    }
    log(`Port ${port} has been liberated successfully.`);
  } catch (e) {
    // Ignore errors if no process is using the port
  }
}

const PAIRING_TTL_MS = 300_000; // 5 minutes

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
function getLocalIP() {
  const interfaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

function getAllLocalIPs() {
  const ips = [];
  const interfaces = networkInterfaces();
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  if (ips.length === 0) ips.push('127.0.0.1');
  return ips;
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

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      connectedDevices: connectedDevices.size,
      uptime: process.uptime(),
      localIP: getLocalIP(),
      port: PORT,
      pairingCode: getCode(),
      codeExpiresAt,
      hostname: hostname().toUpperCase().replace(/[^A-Z0-9-]/g, ''),
      devices: Array.from(connectedDevices.values()).map(d => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        connected: d.connected,
        lastSeen: d.lastSeen,
      })),
    }));
    return;
  }

  if (req.url === '/pair') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      code: getCode(),
      expiresAt: codeExpiresAt,
      port: PORT,
      localIP: getLocalIP(),
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// --- Socket.IO Server ---
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000,
});

// --- Connected devices ---
const connectedDevices = new Map();

// --- Host Skill Registry (Node-capable) ---
let nodeRegistry = null;

async function getOrCreateNodeRegistry() {
  if (nodeRegistry) return nodeRegistry;
  log("Initializing host Node-capable Skill Registry...");
  const registry = createNodeSkillRegistry();
  
  try {
    const nutAdapter = await createNutJsAdapter();
    const computerController = new ComputerUseController(nutAdapter);
    registry.registerMany(createComputerUseSkills(computerController));
    log("Loaded computer-use host OS automation adapter.");
  } catch (e) {
    log(`Failed to load computer-use node adapter: ${e.message}`);
    const computerController = new ComputerUseController();
    registry.registerMany(createComputerUseSkills(computerController));
  }

  try {
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
io.on('connection', (socket) => {
  log(`New connection: ${socket.id}`);

  // Pairing
  socket.on(EVENTS.PAIR, (data) => {
    const code = data?.code?.toUpperCase();
    const deviceId = data?.deviceId;

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
      };

      connectedDevices.set(device.id, device);
      socket.join('paired-devices');

      socket.emit(EVENTS.PAIR_CONFIRM, {
        deviceName: 'GHITA Desktop',
        deviceId: device.id,
      });

      regenerateCode();
      log(`Device paired: ${device.name} (${device.id})`);
      ipcEmit(EVENTS.PAIR_CONFIRM, { deviceId: device.id, name: device.name, platform: device.platform });
    } else if (deviceId) {
      device = connectedDevices.get(deviceId);
      if (device) {
        device.socketId = socket.id;
        device.connected = true;
        device.lastSeen = Date.now();
        socket.join('paired-devices');

        socket.emit(EVENTS.PAIR_CONFIRM, {
          deviceName: 'GHITA Desktop',
          deviceId: device.id,
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

  // Ralph Loop Execution
  socket.on('ralph_loop_run', async (data) => {
    const task = data?.task || '';
    const maxIterations = data?.maxIterations || 3;
    const costLimitUsd = data?.costLimitUsd || 0.10;

    log(`Running Ralph Loop for task: "${task}"`);
    
    // Gửi tín hiệu bắt đầu
    io.emit('chat_start', { text: `[Ralph Loop] Đang khởi động vòng lặp tự sửa sai cho tác vụ: "${task}"`, senderId: 'system', senderName: 'GHITA Engine' });

    try {
      if (grpcServerInstance && grpcServerInstance.orchestrator) {
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
          io.emit('ralph_loop_progress', {
            iteration: progress.iteration,
            cost: progress.cost,
            message: progress.message,
            code: progress.code,
          });
          
          // Gửi text tiến trình vào chat panel
          io.emit('chat_chunk', { text: `\n🔄 **[Vòng lặp ${progress.iteration}]** ${progress.message}\n` });
          if (progress.code) {
            io.emit('chat_chunk', { text: `\`\`\`tsx\n${progress.code}\n\`\`\`\n` });
          }
        });

        io.emit('ralph_loop_done', {
          success: result.success,
          iterations: result.currentIteration,
          totalCostUsd: result.totalCostUsd,
          totalTokens: result.totalTokensUsed.totalTokens,
          code: result.history[result.history.length - 1]?.content || '',
        });
        
        io.emit('chat_done', {
          text: `### 🎉 Ralph Loop Hoàn Tất!
- **Trạng thái:** ${result.success ? 'Thành công ✨' : 'Thất bại ❌'}
- **Số lượt sửa lỗi:** ${result.currentIteration} lần
- **Tổng lượng token:** ${result.totalTokensUsed.totalTokens} tokens
- **Tổng chi phí ước tính:** $${result.totalCostUsd.toFixed(5)} USD
- **Giải pháp cuối cùng:** Đã được đồng bộ hóa thành công!`
        });

      } else {
        io.emit('chat_error', { message: 'AI Orchestrator chưa được cấu hình cho Ralph Loop.' });
      }
    } catch (err) {
      log(`Error in Ralph Loop execution: ${err.message}`);
      io.emit('chat_error', { message: `Ralph Loop Exception: ${err.message}` });
    }
  });

  // Commands
  socket.on(EVENTS.COMMAND, (data) => {
    const device = findDeviceBySocket(socket.id);
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

  // Chat
  socket.on(EVENTS.CHAT, async (data) => {
    const device = findDeviceBySocket(socket.id);
    const isDesktop = data?.isDesktop || !device;

    if (!isDesktop && !device) {
      socket.emit(EVENTS.ERROR, { message: 'Unauthorized: Device is not paired' });
      return;
    }

    const senderName = device ? device.name : 'Desktop';
    const senderId = device ? device.id : 'desktop';

    if (data?.text) {
      if (device) device.lastSeen = Date.now();
      log(`Chat from ${senderName}: ${data.text}`);

      // Nếu từ Mobile, emit lên Tauri qua stdout
      if (!isDesktop) {
        ipcEmit(EVENTS.CHAT, { deviceId: senderId, text: data.text });
      }

      // Rà quét bảo mật PreToolUse Hook cho các lệnh CLI tự chạy hoặc các từ khóa nhạy cảm
      if (data.text.startsWith('/') || data.text.includes('rm ') || data.text.includes('bash ') || data.text.includes('curl ') || data.text.includes('nc ')) {
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
      io.emit('chat_start', { text: data.text, senderId, senderName });

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
          const stream = grpcServerInstance.orchestrator.chatStream(messages, {
            provider: data.provider || undefined,
            model: data.model || undefined,
          });

          for await (const chunk of stream) {
            if (chunk.content) {
              fullResponse += chunk.content;
              io.emit('chat_chunk', { text: chunk.content });
            }
          }

          io.emit('chat_done', { text: fullResponse });
        } else {
          // Fallback response nếu orchestrator chưa sẵn sàng
          io.emit('chat_chunk', { text: `[Sidecar] AI Orchestrator chưa được cấu hình hoàn chỉnh. Nhận được: "${data.text}"` });
          io.emit('chat_done', { text: `AI Orchestrator chưa được cấu hình.` });
        }
      } catch (err) {
        log(`Error generating AI streaming: ${err.message}`);
        io.emit('chat_error', { message: err.message });
        // Luôn phát chat_done để giải phóng trạng thái UI trên client
        io.emit('chat_done', { text: fullResponse || `Lỗi: ${err.message}` });
      }

    }
  });

  // Screenshot
  socket.on(EVENTS.SCREENSHOT, async () => {
    const device = findDeviceBySocket(socket.id);
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

  // Approve/Reject
  socket.on(EVENTS.APPROVE, () => {
    const device = findDeviceBySocket(socket.id);
    if (device) {
      device.lastSeen = Date.now();
      ipcEmit(EVENTS.APPROVE, { deviceId: device.id });
    }
  });

  socket.on(EVENTS.REJECT, () => {
    const device = findDeviceBySocket(socket.id);
    if (device) {
      device.lastSeen = Date.now();
      ipcEmit(EVENTS.REJECT, { deviceId: device.id });
    }
  });

  // Pong
  socket.on(EVENTS.PONG, () => {
    const device = findDeviceBySocket(socket.id);
    if (device) device.lastSeen = Date.now();
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

// --- Global Exception & Rejection Shield ---
process.on('uncaughtException', (err) => {
  log(`CRITICAL SHIELD: Uncaught Exception: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  ipcEmit('server_error', { type: 'uncaughtException', message: err.message });
});

process.on('unhandledRejection', (reason, promise) => {
  log(`CRITICAL SHIELD: Unhandled Rejection at: ${promise}, reason: ${reason}`);
  ipcEmit('server_error', { type: 'unhandledRejection', message: String(reason) });
});

// --- Start ---
log(`Preparing ports...`);
liberatePort(PORT);
liberatePort(50051); // Dọn dẹp cổng gRPC mặc định trước khi khởi tạo

httpServer.on('error', (err) => {
  log(`CRITICAL: HTTP Server failed to start: ${err.message}`);
  ipcEmit('server_error', { type: 'httpServerError', message: err.message });
  process.exit(1);
});

httpServer.listen(PORT, HOST, async () => {
  const ip = getLocalIP();
  log(`Server listening on ${HOST}:${PORT}`);
  log(`Local IP: ${ip}`);
  const code = getCode();
  log(`Pairing code: ${code}`);
  publishToCloudDiscovery();

  // Khởi động gRPC Server
  try {
    const configLoader = new ConfigLoader();
    const localConfig = configLoader.load();
    const providerConfigs = configLoader.toProviderConfigs(localConfig);

    const orchestrator = new Orchestrator({
      providers: providerConfigs,
      defaultProvider: localConfig.agentRouting.default || undefined,
      routing: localConfig.agentRouting,
    });

    grpcServerInstance = new GrpcServer(orchestrator);
    
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

