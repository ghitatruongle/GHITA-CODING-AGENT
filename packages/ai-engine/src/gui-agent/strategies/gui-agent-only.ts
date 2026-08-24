/**

 *
 * Pure pixel-based automation. Uses a screenshot pipeline + a vision model
 * to locate the target element, then issues coordinate-based actions
 * (click, drag, type, hotkey) via an Operator (NutJS or ADB).
 *
 * No browser context, no DOM, no accessibility tree.
 */

import type { Point, BoundingBox, ScreenSize } from '../grounding.js';

export interface PixelOperator {
  /** Capture the current screen as a base64 PNG. */
  screenshot(): Promise<{ base64: string; size: ScreenSize }>;
  /** Perform a coordinate-based action. */
  click(point: Point, button?: 'left' | 'right' | 'middle'): Promise<void>;
  drag(from: Point, to: Point): Promise<void>;
  type(text: string): Promise<void>;
  hotkey(keys: string[]): Promise<void>;
  scroll(amount: number, direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
  wait(ms: number): Promise<void>;
}

export interface VisionLocator {
  /**
   * Given a screenshot and a natural-language description, return a
   * grounded bounding box on the screen.
   */
  locate(
    screenshotBase64: string,
    description: string,
  ): Promise<{ box: BoundingBox; confidence: number }>;
}

export type GuiAgentAction =
  | { type: 'click'; description: string; button?: 'left' | 'right' | 'middle' }
  | { type: 'doubleClick'; description: string }
  | { type: 'rightClick'; description: string }
  | { type: 'drag'; fromDescription: string; toDescription: string }
  | { type: 'type'; text: string }
  | { type: 'hotkey'; keys: string[] }
  | { type: 'scroll'; amount: number; direction: 'up' | 'down' | 'left' | 'right' }
  | { type: 'wait'; ms: number };

export interface GuiAgentOnlyConfig {
  operator: PixelOperator;
  locator: VisionLocator;
  /** Minimum confidence to accept a grounded location. */
  minConfidence?: number;
}

export interface GuiAgentExecutionResult {
  ok: boolean;
  reason?: string;
  action: GuiAgentAction;
  point?: Point;
}

/**
 * GUI agent that operates purely on pixels. Each action is grounded
 * through a vision model and then dispatched through the pixel operator.
 */
export class GuiAgentOnlyStrategy {
  readonly name = 'gui-agent-only' as const;
  private readonly operator: PixelOperator;
  private readonly locator: VisionLocator;
  private readonly minConfidence: number;

  constructor(config: GuiAgentOnlyConfig) {
    this.operator = config.operator;
    this.locator = config.locator;
    this.minConfidence = config.minConfidence ?? 0.6;
  }

  private centerPoint(box: BoundingBox): Point {
    return {
      x: (box.x1 + box.x2) / 2,
      y: (box.y1 + box.y2) / 2,
    };
  }

  private async locateOrFail(description: string): Promise<{ point: Point; confidence: number }> {
    const shot = await this.operator.screenshot();
    const located = await this.locator.locate(shot.base64, description);
    if (located.confidence < this.minConfidence) {
      throw new Error(
        `[gui-agent-only] low-confidence grounding (${located.confidence.toFixed(2)} < ${this.minConfidence}) for "${description}"`,
      );
    }
    return { point: this.centerPoint(located.box), confidence: located.confidence };
  }

  async execute(action: GuiAgentAction): Promise<GuiAgentExecutionResult> {
    try {
      switch (action.type) {
        case 'click': {
          const located = await this.locateOrFail(action.description);
          await this.operator.click(located.point, action.button);
          return { ok: true, action, point: located.point };
        }
        case 'doubleClick': {
          const located = await this.locateOrFail(action.description);
          await this.operator.click(located.point, 'left');
          await this.operator.click(located.point, 'left');
          return { ok: true, action, point: located.point };
        }
        case 'rightClick': {
          const located = await this.locateOrFail(action.description);
          await this.operator.click(located.point, 'right');
          return { ok: true, action, point: located.point };
        }
        case 'drag': {
          const from = await this.locateOrFail(action.fromDescription);
          const to = await this.locateOrFail(action.toDescription);
          await this.operator.drag(from.point, to.point);
          return { ok: true, action };
        }
        case 'type': {
          await this.operator.type(action.text);
          return { ok: true, action };
        }
        case 'hotkey': {
          await this.operator.hotkey(action.keys);
          return { ok: true, action };
        }
        case 'scroll': {
          await this.operator.scroll(action.amount, action.direction);
          return { ok: true, action };
        }
        case 'wait': {
          await this.operator.wait(action.ms);
          return { ok: true, action };
        }
      }
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
        action,
      };
    }
  }
}
