// ==============================================================================
// GHITA CODING AGENT — Logger System
// ==============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
}

export type LogHandler = (entry: LogEntry) => void;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '#6b7280',
  info: '#818cf8',
  warn: '#f59e0b',
  error: '#ef4444',
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

class Logger {
  private level: LogLevel = 'info';
  private context: string;
  private handlers: LogHandler[] = [];

  constructor(context: string = 'GHITA') {
    this.context = context;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  child(context: string): Logger {
    const child = new Logger(`${this.context}:${context}`);
    child.level = this.level;
    child.handlers = [...this.handlers];
    return child;
  }

  addHandler(handler: LogHandler): void {
    this.handlers.push(handler);
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
    };

    // Console output
    this.consoleLog(entry);

    // Custom handlers
    for (const handler of this.handlers) {
      try {
        handler(entry);
      } catch {
        // Prevent handler errors from breaking the logger
      }
    }
  }

  private consoleLog(entry: LogEntry): void {
    const color = LEVEL_COLORS[entry.level];
    const label = LEVEL_LABELS[entry.level];
    const time = entry.timestamp.substring(11, 23);
    const prefix = `[${time}] [${label}] [${entry.context}]`;

    const style = `color: ${color}; font-weight: bold;`;
    const msgStyle = `color: ${color};`;

    if (entry.data !== undefined) {
      console.info(`%c${prefix}%c ${entry.message}`, style, msgStyle, entry.data);
    } else {
      console.info(`%c${prefix}%c ${entry.message}`, style, msgStyle);
    }
  }
}

// Default logger instance
export const logger = new Logger();

// Factory function
export function createLogger(context: string): Logger {
  return logger.child(context);
}

// File handler factory (for Tauri/Node environments)
export function createFileHandler(writeFn: (text: string) => void): LogHandler {
  return (entry: LogEntry) => {
    const time = entry.timestamp.substring(11, 23);
    const label = LEVEL_LABELS[entry.level];
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
    writeFn(`[${time}] [${label}] [${entry.context}] ${entry.message}${dataStr}\n`);
  };
}
