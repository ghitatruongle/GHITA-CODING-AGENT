import type { SkillDefinition } from '@ghita/skills';
export * from './vision/types.js';
export { GuiGrounder } from './vision/grounding.js';
export { VisionScreenshotAnalyzer } from './vision/analyzer.js';
export { ActionParser } from './actionParser.js';
export declare const COMPUTER_USE_VERSION = "0.1.0";
export interface Point {
    x: number;
    y: number;
}
export interface ScreenSize {
    width: number;
    height: number;
}
export interface ScreenCapture {
    mimeType: string;
    data: string;
    size?: ScreenSize;
}
export type MouseButton = 'left' | 'right' | 'middle';
export type ComputerUseAction = {
    type: 'moveMouse';
    point: Point;
} | {
    type: 'click';
    point?: Point;
    button?: MouseButton;
} | {
    type: 'typeText';
    text: string;
} | {
    type: 'pressKey';
    key: string;
} | {
    type: 'screenshot';
};
export interface ComputerUseActionResult {
    action: ComputerUseAction;
    success: boolean;
    output?: string;
    error?: string;
    data?: unknown;
}
export interface ComputerUseAdapter {
    getScreenSize?: () => Promise<ScreenSize>;
    moveMouse?: (point: Point) => Promise<void>;
    click?: (point?: Point, button?: MouseButton) => Promise<void>;
    typeText?: (text: string) => Promise<void>;
    pressKey?: (key: string) => Promise<void>;
    screenshot?: () => Promise<ScreenCapture>;
}
export interface ComputerUseStatus {
    available: boolean;
    missing: string[];
}
export declare class ComputerUseController {
    private readonly adapter;
    constructor(adapter?: ComputerUseAdapter);
    getStatus(): ComputerUseStatus;
    moveMouse(point: Point): Promise<ComputerUseActionResult>;
    click(point?: Point, button?: MouseButton): Promise<ComputerUseActionResult>;
    typeText(text: string): Promise<ComputerUseActionResult>;
    pressKey(key: string): Promise<ComputerUseActionResult>;
    screenshot(): Promise<ComputerUseActionResult>;
    runAction(action: ComputerUseAction): Promise<ComputerUseActionResult>;
    runSequence(actions: ComputerUseAction[]): Promise<ComputerUseActionResult[]>;
    /**
     * Execute prediction string (UI-TARS or multimodal action output) on screen context.
     */
    executeActionText(prediction: string, size: ScreenSize): Promise<ComputerUseActionResult[]>;
}
export declare function createComputerUseSkills(controller?: ComputerUseController): SkillDefinition[];
//# sourceMappingURL=index.d.ts.map