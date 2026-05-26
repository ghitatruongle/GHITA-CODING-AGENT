import type { Orchestrator } from '../orchestrator.js';
export declare class OCRProcessor {
    private orchestrator?;
    constructor(orchestrator?: Orchestrator);
    /**
     * Trích xuất văn bản từ hình ảnh sử dụng Multimodal LLM
     */
    parseImage(image: Buffer, _mimeType?: string): Promise<{
        text: string;
        confidence: number;
    }>;
}
export declare class VideoContentAnalyzer {
    private orchestrator?;
    constructor(orchestrator?: Orchestrator);
    /**
     * Phân tích nội dung video đa phương thức
     */
    analyzeVideo(video: Buffer, _mimeType?: string): Promise<{
        summary: string;
        framesAnalyzed: number;
    }>;
}
//# sourceMappingURL=ocr-video.d.ts.map