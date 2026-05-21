import type { PredictionParsed } from './vision/types.js';
export declare const MAX_RATIO = 2.5;
export declare const IMAGE_FACTOR = 28;
export declare const MIN_PIXELS: number;
export declare const MAX_PIXELS_V1_5: number;
export declare function roundByFactor(num: number, factor: number): number;
export declare function floorByFactor(num: number, factor: number): number;
export declare function ceilByFactor(num: number, factor: number): number;
/**
 * Smart resize algorithm for UI-TARS v1.5
 * Resizes screen height & width to comply with factor and pixel budget limits.
 */
export declare function smartResizeForV15(height: number, width: number, maxRatio?: number, factor?: number, minPixels?: number, maxPixels?: number): [number, number] | null;
/**
 * Parses action string (e.g., click(start_box='(279,81)')) into function & args
 */
export declare function parseAction(actionStr: string): {
    function: string;
    args: Record<string, string>;
} | null;
export declare class ActionParser {
    /**
     * Main entry point to parse prediction string.
     */
    static parse(params: {
        prediction: string;
        factor?: number | [number, number];
        screenContext?: {
            width: number;
            height: number;
        };
        scaleFactor?: number;
        mode?: 'bc' | 'o1';
        modelVer?: 'v1.0' | 'v1.5';
    }): PredictionParsed[];
}
//# sourceMappingURL=actionParser.d.ts.map