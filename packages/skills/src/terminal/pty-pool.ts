// Maintains long-running interactive terminal sessions (e.g. dev servers, ssh,
// docker compose) with real-time stdout/stderr log streaming and crash detection.

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
      // Bound the per-session log so long-lived PTYs cannot grow memory.
      if (session.logs.length > 2000) session.logs.splice(0, session.logs.length - 1000);
      // Only a real node/npm failure marker at line start flips status —
      // incidental mentions of ERR_ in normal traffic must not crash-flag.
      if (/^ERR_|\bSyntaxError:|ELIFECYCLE/.test(logLine.trim())) {
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
