import { VisionScreenshotAnalyzer } from './analyzer.js';
import { ActionParser } from '../actionParser.js';
import type { GroundingResult, ScreenSize, Point, BoundingBox } from './types.js';

export class GuiGrounder {
  private analyzer: VisionScreenshotAnalyzer;

  constructor(analyzer?: VisionScreenshotAnalyzer) {
    this.analyzer = analyzer || new VisionScreenshotAnalyzer();
  }

  /**
   * Ground a natural language description to coordinates on the screen.
   * Returns a point and bounding box in normalized [0, 1] range (and physical coords if size is provided).
   */
  async ground(
    screenshotBase64: string,
    description: string,
    screenSize?: ScreenSize,
  ): Promise<GroundingResult> {
    const rawActionStr = await this.analyzer.ground(screenshotBase64, description);

    // Parse using ActionParser
    const parsedActions = ActionParser.parse({
      prediction: rawActionStr,
      factor: 1000,
      screenContext: screenSize
        ? { width: screenSize.width, height: screenSize.height }
        : undefined,
    });

    if (parsedActions.length === 0) {
      throw new Error(
        `Failed to ground description "${description}": No actions parsed from prediction: ${rawActionStr}`,
      );
    }

    const action = parsedActions[0];
    if (!action) {
      throw new Error(
        `Failed to ground description "${description}": No action found in parsed results`,
      );
    }
    const startBoxStr = action.action_inputs.start_box;
    if (!startBoxStr) {
      throw new Error(
        `Failed to ground description "${description}": No start_box input found in action: ${JSON.stringify(action)}`,
      );
    }

    // start_box is a stringified JSON array of floats [x1, y1, x2, y2]
    const boxCoords: number[] = JSON.parse(startBoxStr);
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = boxCoords;

    const box: BoundingBox = { x1, y1, x2, y2 };

    // Calculate normalized point (center of bounding box)
    const point: Point = {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
    };

    // If screenSize was provided, convert the center coordinates to physical pixels
    if (screenSize) {
      const physPoint: Point = {
        x: Math.round(point.x * screenSize.width),
        y: Math.round(point.y * screenSize.height),
      };
      return {
        point: physPoint,
        box,
        confidence: 0.9, // Default VLM confidence for matching
      };
    }

    return {
      point,
      box,
      confidence: 0.9,
    };
  }
}
