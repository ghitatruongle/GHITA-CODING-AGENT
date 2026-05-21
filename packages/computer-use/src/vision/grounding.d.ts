import { VisionScreenshotAnalyzer } from './analyzer.js';
import type { GroundingResult, ScreenSize } from './types.js';
export declare class GuiGrounder {
    private analyzer;
    constructor(analyzer?: VisionScreenshotAnalyzer);
    /**
     * Ground a natural language description to coordinates on the screen.
     * Returns a point and bounding box in normalized [0, 1] range (and physical coords if size is provided).
     */
    ground(screenshotBase64: string, description: string, screenSize?: ScreenSize): Promise<GroundingResult>;
}
//# sourceMappingURL=grounding.d.ts.map