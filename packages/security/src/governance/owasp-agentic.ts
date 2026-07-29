// ==============================================================================
// v0.4.9 A2: Agent Governance — OWASP Agentic AI Top 10 Checks
//
// Heuristic checks that map an agent action context to the OWASP Agentic AI
// Top 10 risk catalogue. These are runtime guardrails, not a substitute for
// design review — they surface the most common failure modes cheaply.
// ==============================================================================

import type { AgentActionContext, GovernanceFinding } from './types.js';

/** Ngưỡng mặc định cho các heuristic. */
export interface OwaspCheckOptions {
  /** Số vòng lặp tối đa trước khi cảnh báo resource overload. Mặc định 25. */
  maxIterations?: number;
  /** Tỷ lệ token đã dùng/giới hạn kích hoạt cảnh báo. Mặc định 0.9. */
  tokenUsageWarnRatio?: number;
  /** Số approval chờ tối đa trước khi cảnh báo HITL quá tải. Mặc định 5. */
  maxPendingApprovals?: number;
  /** Điểm tin cậy ký ức tối thiểu. Mặc định 0.5. */
  minMemoryTrust?: number;
}

/** Các mẫu prompt-injection/intent-manipulation thường gặp. */
const INTENT_MANIPULATION_PATTERNS: RegExp[] = [
  /\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?\b/i,
  /\bdisregard\s+(?:the\s+)?(?:system|previous)\s+prompt\b/i,
  /\byou\s+are\s+now\s+(?:a\s+)?(?:different|new)\b/i,
  /\b(?:reveal|print|show)\s+(?:your\s+)?(?:system\s+prompt|instructions|secrets?)\b/i,
  /\bdeveloper\s+mode\b/i,
];

/** Các hành động tool "nguy hiểm" cần đặc quyền rõ ràng. */
const DANGEROUS_ACTIONS = new Set(['delete', 'execute', 'write', 'deploy', 'grant']);

/**
 * Chấm một lượt hành động agent theo OWASP Agentic Top 10.
 * Trả về danh sách finding (rỗng nếu không phát hiện rủi ro).
 */
export function checkOwaspAgentic(
  ctx: AgentActionContext,
  options: OwaspCheckOptions = {},
): GovernanceFinding[] {
  const maxIterations = options.maxIterations ?? 25;
  const tokenWarnRatio = options.tokenUsageWarnRatio ?? 0.9;
  const maxPendingApprovals = options.maxPendingApprovals ?? 5;
  const minMemoryTrust = options.minMemoryTrust ?? 0.5;
  const findings: GovernanceFinding[] = [];

  // AAI01 — Memory poisoning: nguồn ký ức tin cậy thấp.
  if (ctx.memoryTrustScore !== undefined && ctx.memoryTrustScore < minMemoryTrust) {
    findings.push({
      riskId: 'AAI01-memory-poisoning',
      severity: 'high',
      title: 'Low-trust memory used in agent context',
      detail: `memoryTrustScore=${ctx.memoryTrustScore.toFixed(2)} is below ${minMemoryTrust}.`,
      remediation: 'Validate/quarantine untrusted memories before feeding them into planning.',
    });
  }

  // AAI02 / AAI03 — Tool misuse & privilege compromise: hành động nguy hiểm.
  for (const call of ctx.toolCalls ?? []) {
    if (DANGEROUS_ACTIONS.has(call.action)) {
      findings.push({
        riskId: 'AAI03-privilege-compromise',
        severity: call.action === 'delete' || call.action === 'grant' ? 'critical' : 'high',
        title: `Privileged action requested: ${call.tool}:${call.action}`,
        detail: `Resource: ${call.resource ?? '(unspecified)'}.`,
        remediation: 'Require explicit human approval and scope the credential to least privilege.',
      });
    }
  }

  // AAI04 — Resource overload: lặp quá nhiều hoặc gần cạn token budget.
  if (ctx.iterationCount !== undefined && ctx.iterationCount > maxIterations) {
    findings.push({
      riskId: 'AAI04-resource-overload',
      severity: 'medium',
      title: 'Iteration budget exceeded',
      detail: `iterationCount=${ctx.iterationCount} > ${maxIterations}.`,
      remediation: 'Enforce a hard loop cap and back off to a human when reached.',
    });
  }
  if (ctx.tokenUsage && ctx.tokenUsage.limit > 0) {
    const ratio = ctx.tokenUsage.used / ctx.tokenUsage.limit;
    if (ratio >= tokenWarnRatio) {
      findings.push({
        riskId: 'AAI04-resource-overload',
        severity: ratio >= 1 ? 'high' : 'medium',
        title: 'Token budget nearly/fully consumed',
        detail: `used ${ctx.tokenUsage.used}/${ctx.tokenUsage.limit} (${(ratio * 100).toFixed(0)}%).`,
        remediation: 'Stop or checkpoint the run; persist budget across restarts.',
      });
    }
  }

  // AAI06 — Intent manipulation / prompt injection.
  if (ctx.input) {
    const hit = INTENT_MANIPULATION_PATTERNS.find((p) => p.test(ctx.input as string));
    if (hit) {
      findings.push({
        riskId: 'AAI06-intent-manipulation',
        severity: 'high',
        title: 'Possible prompt-injection / intent manipulation',
        detail: `Input matched pattern ${hit.source}.`,
        remediation: 'Treat the input as untrusted data; do not let it override system policy.',
      });
    }
  }

  // AAI08 — Repudiation & untraceability: không ghi audit.
  if (ctx.auditLogged === false) {
    findings.push({
      riskId: 'AAI08-repudiation-untraceability',
      severity: 'medium',
      title: 'Action executed without audit logging',
      detail: 'auditLogged is explicitly false for this turn.',
      remediation: 'Emit a tamper-evident audit record for every privileged action.',
    });
  }

  // AAI09 — Identity spoofing: thiếu agentId khi có tool-call.
  if ((ctx.toolCalls?.length ?? 0) > 0 && !ctx.agentId) {
    findings.push({
      riskId: 'AAI09-identity-spoofing',
      severity: 'medium',
      title: 'Tool-calls issued without an agent identity',
      detail: 'No agentId attached to the action context.',
      remediation: 'Bind every tool-call to an authenticated agent identity (zero-trust).',
    });
  }

  // AAI10 — Overwhelming human-in-the-loop.
  if (ctx.pendingApprovals !== undefined && ctx.pendingApprovals > maxPendingApprovals) {
    findings.push({
      riskId: 'AAI10-overwhelming-hitl',
      severity: 'low',
      title: 'Too many pending approvals for the operator',
      detail: `pendingApprovals=${ctx.pendingApprovals} > ${maxPendingApprovals}.`,
      remediation: 'Batch or auto-resolve low-risk approvals to avoid rubber-stamping.',
    });
  }

  return findings;
}
