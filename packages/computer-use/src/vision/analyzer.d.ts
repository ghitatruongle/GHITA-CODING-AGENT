import type { VisionAnalyzerResult } from './types.js';
export declare class VisionScreenshotAnalyzer {
    private configPath;
    constructor();
    /**
     * Load active API configuration from ~/.openclaude.json
     */
    private loadConfig;
    /**
     * Analyze screenshot for general layout and element locations
     */
    analyze(screenshotBase64: string): Promise<VisionAnalyzerResult>;
    /**
     * Ground a natural language description to coordinates
     */
    ground(screenshotBase64: string, description: string): Promise<string>;
    /**
     * Helper to perform HTTP request to multimodal LLMs
     */
    private queryMultimodalLLM;
    private parseJsonBlock;
}
//# sourceMappingURL=analyzer.d.ts.map