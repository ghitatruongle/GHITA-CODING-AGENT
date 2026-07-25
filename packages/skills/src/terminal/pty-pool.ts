// ==============================================================================
// GHITA CODING AGENT - Long-Running PTY Pseudo-Terminal Session Pool
// ==============================================================================
// Maintains long-running interactive terminal sessions (e.g. dev servers, ssh,
// docker compose) with real-time stdout/stderr log streaming and crash detection.
// ==============================================================================

export interface PTYSession {
  id: string;
  name: string;
  command: string;
  cwd: string;
  status: 'running' | 'stopped' | 'crashed';
  logs: string[];
  startedAt: number;
}

export class PTYSessionPool {
  private sessions: Map<string, PTYSession> = new Map();

  createSession(id: string, name: string, command: string, cwd: string): PTYSession {
    const session: PTYSession = {
      id,
      name,
      command,
      cwd,
      status: 'running',
      logs: [`[PTY Session Created]: ${command} in ${cwd}`],
      startedAt: Date.now(),
    };

    this.sessions.set(id, session);
    return session;
  }

  appendLog(id: string, logLine: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.logs.push(logLine);
      if (
        logLine.includes('ERR_') ||
        logLine.includes('SyntaxError') ||
        logLine.includes('ELIFECYCLE')
      ) {
        session.status = 'crashed';
      }
    }
  }

  getSession(id: string): PTYSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): PTYSession[] {
    return [...this.sessions.values()];
  }

  stopSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (session) {
      session.status = 'stopped';
      return true;
    }
    return false;
  }
}
