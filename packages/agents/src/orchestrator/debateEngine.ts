// ==============================================================================
// GHITA CODING AGENT - Debate-Driven Architectural Alignment (Phase 6)
// ==============================================================================

import { HumanMessage, SystemMessage } from '../messages/message.js';
import type { BaseMessage } from '../messages/message.js';

export interface DebateResult {
  spec: string;
  consensusScore: number;
  debateLog: string;
  approved: boolean;
}

export interface DebateCallbacks {
  onTurnStart?: (role: 'Innovator' | 'DevilAdvocate' | 'EIC', turn: number) => void;
  onTurnEnd?: (role: 'Innovator' | 'DevilAdvocate' | 'EIC', turn: number, content: string) => void;
  onApprovalRequired?: (spec: string, consensusScore: number) => Promise<boolean>;
}

export interface DebateEngineOptions {
  /** Hàm gọi LLM để lấy phản hồi từ tin nhắn */
  llmCall: (messages: BaseMessage[], options?: any) => Promise<BaseMessage>;
  model?: string;
}

export class DebateEngine {
  private readonly llmCall: DebateEngineOptions['llmCall'];
  private readonly model: string;
  private readonly maxTurns = 3; // Debate Turn Budget = 3

  constructor(options: DebateEngineOptions) {
    this.llmCall = options.llmCall;
    this.model = options.model || 'gpt-4o';
  }

  /**
   * Khởi chạy luồng tranh biện đa tác nhân 3 lượt và tổng hợp Spec kỹ thuật tối ưu
   * @param topic Chủ đề kiến trúc cần thiết kế
   * @param docsContext Tài liệu tham chiếu làm căn cứ đối soát
   * @param callbacks Các sự kiện phản hồi trong chu kỳ tranh biện
   */
  async runDebate(
    topic: string,
    docsContext: string,
    callbacks?: DebateCallbacks
  ): Promise<DebateResult> {
    const debateHistory: Array<{ role: 'Innovator' | 'DevilAdvocate'; turn: number; content: string }> = [];
    let currentSpec = `Draft specification for topic: ${topic}`;

    // --- LƯỢT TRANH BIỆN (Turn Budget = 3) ---
    for (let turn = 1; turn <= this.maxTurns; turn++) {
      // 1. INNOVATOR TẠO / CẬP NHẬT SPEC
      callbacks?.onTurnStart?.('Innovator', turn);
      currentSpec = await this.callInnovator(topic, docsContext, currentSpec, debateHistory, turn);
      debateHistory.push({ role: 'Innovator', turn, content: currentSpec });
      callbacks?.onTurnEnd?.('Innovator', turn, currentSpec);

      // 2. DEVIL'S ADVOCATE PHẢN BIỆN KHỐC LIỆT
      callbacks?.onTurnStart?.('DevilAdvocate', turn);
      const critique = await this.callDevilsAdvocate(topic, docsContext, currentSpec, debateHistory, turn);
      debateHistory.push({ role: 'DevilAdvocate', turn, content: critique });
      callbacks?.onTurnEnd?.('DevilAdvocate', turn, critique);
    }

    // --- EDITOR-IN-CHIEF TỔNG HỢP VÀ CHẤM ĐIỂM ---
    callbacks?.onTurnStart?.('EIC', 4);
    const eicResult = await this.callEditorInChief(topic, docsContext, debateHistory);
    callbacks?.onTurnEnd?.('EIC', 4, eicResult.spec);

    // --- THỦ TỤC PHÊ DUYỆT (Approval Spec) ---
    let approved = true;
    if (callbacks?.onApprovalRequired) {
      approved = await callbacks.onApprovalRequired(eicResult.spec, eicResult.consensusScore);
    }

    // Tạo log tranh luận dạng chuỗi để lưu vết
    const debateLog = debateHistory
      .map(entry => `[Lượt ${entry.turn} - ${entry.role}]:\n${entry.content}\n-----------------------`)
      .join('\n\n');

    return {
      spec: eicResult.spec,
      consensusScore: eicResult.consensusScore,
      debateLog,
      approved,
    };
  }

  /**
   * Gọi LLM cho Innovator Agent
   */
  private async callInnovator(
    topic: string,
    docs: string,
    currentSpec: string,
    history: Array<{ role: string; turn: number; content: string }>,
    turn: number
  ): Promise<string> {
    const systemPrompt = `You are the Lead Innovator Software Architect.
Your goal is to propose a modern, highly functional, and beautiful technical specification for: "${topic}".
You must address all technical challenges and strictly ground your solutions in the provided documentation context.
Always refine and improve the specification in response to Devil's Advocate criticism.

[DOCUMENTATION GROUND TRUTH]:
${docs}

Provide your specification in clean, detailed markdown. Focus on:
1. System Architecture & Components
2. Performance & Cache strategies
3. Security & Anti-injection guardrails
4. Backward Compatibility & Migrations`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt)
    ];

    if (turn === 1) {
      messages.push(new HumanMessage(`Propose the initial technical specification for the topic: "${topic}".`));
    } else {
      const lastCritique = history[history.length - 1]?.content || '';
      messages.push(new HumanMessage(`Here is the current draft specification:
${currentSpec}

Here is the Devil's Advocate critique:
${lastCritique}

Please revise and improve the specification to address these critiques.`));
    }

    const response = await this.llmCall(messages, { model: this.model });
    return response.getText();
  }

  /**
   * Gọi LLM cho Devil's Advocate Agent
   */
  private async callDevilsAdvocate(
    _topic: string,
    docs: string,
    currentSpec: string,
    _history: Array<{ role: string; turn: number; content: string }>,
    _turn: number
  ): Promise<string> {
    const systemPrompt = `You are the Devil's Advocate Technical Reviewer.
Your sole job is to aggressively critique the proposed technical specification.
Look for:
- Security vulnerabilities (SQL injection, shell commands injection, OAuth key exposure).
- Performance bottlenecks (inefficient loops, high RAM usage, slow DB queries).
- Breaking changes (backward compatibility failures, migration risks).
- Vague or missing implementation details.

Be extremely critical, rigorous, but professional. Base your arguments on documentation limits.

[DOCUMENTATION LIMITS]:
${docs}`;

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(`Please critique the following draft specification:
${currentSpec}`)
    ];

    const response = await this.llmCall(messages, { model: this.model });
    return response.getText();
  }

  /**
   * Gọi LLM cho Editor-in-Chief Agent để biên soạn Spec tối ưu và tính điểm
   */
  private async callEditorInChief(
    _topic: string,
    docs: string,
    history: Array<{ role: string; turn: number; content: string }>
  ): Promise<{ spec: string; consensusScore: number }> {
    const systemPrompt = `You are the Editor-in-Chief of the Architectural Review Panel.
Review the complete debate between the Innovator and the Devil's Advocate.
Your goal:
1. Synthesize the final, optimized technical specification that addresses the Devil's Advocate critiques.
2. Grade the Consensus Score (from 1 to 10), where:
   - 10: Perfect agreement, all criticisms resolved beautifully.
   - 1: Severe unresolved architectural flaws or security concerns.

Your output MUST be a JSON object conforming strictly to this format:
{
  "consensusScore": <number from 1 to 10>,
  "spec": "<final markdown spec content with escaped quotes>"
}`;

    const debateLog = history
      .map(entry => `[Turn ${entry.turn} - ${entry.role}]:\n${entry.content}`)
      .join('\n\n');

    const messages: BaseMessage[] = [
      new SystemMessage(systemPrompt),
      new HumanMessage(`Here is the reference documentation:
${docs}

Here is the complete debate history:
${debateLog}

Please output the JSON object containing consensusScore and the finalized spec.`)
    ];

    const response = await this.llmCall(messages, { model: this.model });
    const text = response.getText();

    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          spec: parsed.spec || text,
          consensusScore: parsed.consensusScore || 7,
        };
      }
      return { spec: text, consensusScore: 7 };
    } catch {
      return { spec: text, consensusScore: 7 };
    }
  }
}
