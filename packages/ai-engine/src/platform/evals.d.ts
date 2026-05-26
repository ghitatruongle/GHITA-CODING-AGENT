import type { Orchestrator } from '../orchestrator.js';
export interface EvalResult {
    score: number;
    reasoning: string;
    metrics: {
        correctness?: number;
        relevancy?: number;
        toxicity?: number;
        [key: string]: number | undefined;
    };
}
export declare class LLMEvaluator {
    private orchestrator;
    constructor(orchestrator: Orchestrator);
    /**
     * Đánh giá câu trả lời của LLM bằng phương pháp LLM-as-a-Judge
     */
    evaluate(input: string, output: string, reference?: string): Promise<EvalResult>;
}
export declare class IntegratedSearchClient {
    private googleApiKey?;
    private googleCx?;
    private tavilyApiKey?;
    constructor(options?: {
        googleApiKey?: string;
        googleCx?: string;
        tavilyApiKey?: string;
    });
    /**
     * Tìm kiếm thông tin qua Google Search hoặc Tavily API
     */
    search(query: string): Promise<Array<{
        title: string;
        url: string;
        snippet: string;
    }>>;
}
//# sourceMappingURL=evals.d.ts.map