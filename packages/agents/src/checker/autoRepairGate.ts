// ==============================================================================
// GHITA CODING AGENT - Self-Correction & Auto-Repair Gate
// ==============================================================================
// Runs build / test checks after agent code modifications, extracts crash logs,
// analyzes root cause, and automatically executes repair iterations until 100% pass.
// ==============================================================================

export interface TestRunResult {
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  failedTests?: string[];
}

export interface RepairAttempt {
  attemptNumber: number;
  errorLog: string;
  proposedFix: string;
  result: TestRunResult;
}

export interface AutoRepairOptions {
  maxAttempts: number;
  testRunnerCommand: string;
  cwd?: string;
  runCommand: (cmd: string, cwd?: string) => Promise<TestRunResult>;
  agentFixer: (errorLog: string, attempt: number) => Promise<string>;
}

export class AutoRepairGate {
  private options: AutoRepairOptions;

  constructor(options: AutoRepairOptions) {
    this.options = {
      maxAttempts: options.maxAttempts ?? 5,
      testRunnerCommand: options.testRunnerCommand ?? 'npm test',
      cwd: options.cwd,
      runCommand: options.runCommand,
      agentFixer: options.agentFixer,
    };
  }

  /**
   * Execute auto-repair loop until tests pass or max attempts reached.
   */
  async runAutoRepair(): Promise<{
    success: boolean;
    attempts: RepairAttempt[];
    finalLog: string;
  }> {
    const attempts: RepairAttempt[] = [];

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      const testResult = await this.options.runCommand(
        this.options.testRunnerCommand,
        this.options.cwd,
      );

      if (testResult.passed || testResult.exitCode === 0) {
        return {
          success: true,
          attempts,
          finalLog: `Tests passed on attempt #${attempt}`,
        };
      }

      const errorLog = testResult.stderr || testResult.stdout;
      const proposedFix = await this.options.agentFixer(errorLog, attempt);

      attempts.push({
        attemptNumber: attempt,
        errorLog,
        proposedFix,
        result: testResult,
      });
    }

    return {
      success: false,
      attempts,
      finalLog: `Auto-repair reached max attempts (${this.options.maxAttempts}) without full pass.`,
    };
  }
}
