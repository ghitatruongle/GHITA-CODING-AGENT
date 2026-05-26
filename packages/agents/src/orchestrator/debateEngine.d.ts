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
export declare class DebateEngine {
    private readonly llmCall;
    private readonly model;
    private readonly maxTurns;
    constructor(options: DebateEngineOptions);
    /**
     * Khởi chạy luồng tranh biện đa tác nhân 3 lượt và tổng hợp Spec kỹ thuật tối ưu
     * @param topic Chủ đề kiến trúc cần thiết kế
     * @param docsContext Tài liệu tham chiếu làm căn cứ đối soát
     * @param callbacks Các sự kiện phản hồi trong chu kỳ tranh biện
     */
    runDebate(topic: string, docsContext: string, callbacks?: DebateCallbacks): Promise<DebateResult>;
    /**
     * Gọi LLM cho Innovator Agent
     */
    private callInnovator;
    /**
     * Gọi LLM cho Devil's Advocate Agent
     */
    private callDevilsAdvocate;
    /**
     * Gọi LLM cho Editor-in-Chief Agent để biên soạn Spec tối ưu và tính điểm
     */
    private callEditorInChief;
}
//# sourceMappingURL=debateEngine.d.ts.map