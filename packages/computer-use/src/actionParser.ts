// ==============================================================================
// GHITA CODING AGENT - Action Parser for UI-TARS and Multimodal LLMs
// ==============================================================================

import type { ActionInputs, PredictionParsed } from './vision/types.js';

export const MAX_RATIO = 2.5;
export const IMAGE_FACTOR = 28;
export const MIN_PIXELS = 4 * 28 * 28; // 3136
export const MAX_PIXELS_V1_5 = 1280 * 28 * 28; // 1003520

export function roundByFactor(num: number, factor: number): number {
  return Math.round(num / factor) * factor;
}

export function floorByFactor(num: number, factor: number): number {
  return Math.floor(num / factor) * factor;
}

export function ceilByFactor(num: number, factor: number): number {
  return Math.ceil(num / factor) * factor;
}

/**
 * Smart resize algorithm for UI-TARS v1.5
 * Resizes screen height & width to comply with factor and pixel budget limits.
 */
export function smartResizeForV15(
  height: number,
  width: number,
  maxRatio: number = MAX_RATIO,
  factor: number = IMAGE_FACTOR,
  minPixels: number = MIN_PIXELS,
  maxPixels: number = MAX_PIXELS_V1_5,
): [number, number] | null {
  if (Math.max(height, width) / Math.min(height, width) > maxRatio) {
    console.error(
      `Aspect ratio must be smaller than ${maxRatio}, got ${
        Math.max(height, width) / Math.min(height, width)
      }`,
    );
    return null;
  }

  let wBar = Math.max(factor, roundByFactor(width, factor));
  let hBar = Math.max(factor, roundByFactor(height, factor));

  if (hBar * wBar > maxPixels) {
    const beta = Math.sqrt((height * width) / maxPixels);
    hBar = floorByFactor(height / beta, factor);
    wBar = floorByFactor(width / beta, factor);
  } else if (hBar * wBar < minPixels) {
    const beta = Math.sqrt(minPixels / (height * width));
    hBar = ceilByFactor(height * beta, factor);
    wBar = ceilByFactor(width * beta, factor);
  }

  return [wBar, hBar];
}

/**
 * Parses action string (e.g., click(start_box='(279,81)')) into function & args
 */
export function parseAction(
  actionStr: string,
): { function: string; args: Record<string, string> } | null {
  try {
    let normalized = actionStr.trim();
    // Support formats with bounding box and point tags
    normalized = normalized.replace(/<\|box_start\|>|<\|box_end\|>/g, '');
    normalized = normalized
      .replace(/(?<!start_|end_)point=/g, 'start_box=')
      .replace(/start_point=/g, 'start_box=')
      .replace(/end_point=/g, 'end_box=');

    const functionPattern = /^(\w+)\((.*)\)$/;
    const match = normalized.match(functionPattern);

    if (!match) {
      // If it is just a plain function call without arguments, e.g. screenshot()
      if (/^\w+\(\)$/.test(normalized)) {
        return {
          function: normalized.slice(0, -2),
          args: {},
        };
      }
      // If it is a plain action name, e.g. finished
      if (/^\w+$/.test(normalized)) {
        return {
          function: normalized,
          args: {},
        };
      }
      throw new Error('Not a function call format');
    }

    const [, functionName = '', argsStr = ''] = match;
    const kwargs: Record<string, string> = {};

    if (argsStr.trim()) {
      // Split parameters by commas that are not inside quotes
      const argPairs = argsStr.match(/([^,']|'[^']*')+/g) || [];

      for (const pair of argPairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;

        const key = pair.substring(0, eqIdx).trim();
        let value = pair.substring(eqIdx + 1).trim();

        // Strip quotes
        value = value.replace(/^['"]|['"]$/g, '');

        // Standardize tag formats
        if (value.includes('<bbox>')) {
          value = value.replace(/<bbox>|<\/bbox>/g, '').replace(/\s+/g, ',');
          value = `(${value})`;
        }
        if (value.includes('<point>')) {
          value = value.replace(/<point>|<\/point>/g, '').replace(/\s+/g, ',');
          value = `(${value})`;
        }

        kwargs[key] = value;
      }
    }

    return {
      function: functionName,
      args: kwargs,
    };
  } catch (e) {
    console.error(`Failed to parse action string '${actionStr}':`, e);
    return null;
  }
}

export class ActionParser {
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
  }): PredictionParsed[] {
    const {
      prediction,
      factor = 1000,
      screenContext,
      scaleFactor = 1,
      mode = 'bc',
      modelVer = 'v1.0',
    } = params;

    const factors: [number, number] = Array.isArray(factor) ? factor : [factor, factor];
    let reflection: string | null = null;
    let thought: string | null = null;
    let actionStr = '';

    let smartResizeFactors: [number, number] | null = null;
    if (modelVer === 'v1.5' && screenContext?.height && screenContext?.width) {
      smartResizeFactors = smartResizeForV15(screenContext.height, screenContext.width);
    }

    const text = prediction.trim();

    if (mode === 'bc') {
      if (text.includes('Thought:')) {
        const thoughtMatch = text.match(/Thought: ([\s\S]+?)(?=\s*Action[:：]|$)/);
        if (thoughtMatch && thoughtMatch[1]) {
          thought = thoughtMatch[1].trim();
        }
      } else if (text.startsWith('Reflection:')) {
        const reflectionMatch = text.match(
          /Reflection: ([\s\S]+?)Action_Summary: ([\s\S]+?)(?=\s*Action[:：]|$)/,
        );
        if (reflectionMatch && reflectionMatch[1] && reflectionMatch[2]) {
          thought = reflectionMatch[2].trim();
          reflection = reflectionMatch[1].trim();
        }
      } else if (text.startsWith('Action_Summary:')) {
        const summaryMatch = text.match(/Action_Summary: (.+?)(?=\s*Action[:：]|$)/);
        if (summaryMatch && summaryMatch[1]) {
          thought = summaryMatch[1].trim();
        }
      }

      if (!['Action:', 'Action：'].some((keyword) => text.includes(keyword))) {
        actionStr = text;
      } else {
        const actionParts = text.split(/Action[:：]/);
        actionStr = actionParts[actionParts.length - 1] ?? '';
      }
    } else if (mode === 'o1') {
      const thoughtMatch = text.match(/<Thought>\s*(.*?)\s*<\/Thought>/s);
      const actionSummaryMatch = text.match(/\nAction_Summary:\s*(.*?)\s*Action:/s);
      const actionMatch = text.match(/\nAction:\s*(.*?)\s*<\/Output>/s);

      const thoughtContent = thoughtMatch ? thoughtMatch[1] : '';
      const actionSummaryContent = actionSummaryMatch ? actionSummaryMatch[1] : '';
      const actionContent = actionMatch ? actionMatch[1] : '';

      thought = `${thoughtContent}\n<Action_Summary>\n${actionSummaryContent}`.trim();
      actionStr = actionContent || text;
    }

    const allActions = actionStr.split('\n\n');
    const actions: PredictionParsed[] = [];

    for (const rawStr of allActions) {
      const actionInstance = parseAction(rawStr.replace(/\n/g, String.raw`\n`).trimStart());
      let actionType = '';
      let actionInputs: ActionInputs = {};

      if (actionInstance) {
        actionType = actionInstance.function;
        const rawArgs = actionInstance.args;

        for (const [paramName, param] of Object.entries(rawArgs)) {
          if (!param) continue;
          const trimmedParam = param.trim();

          if (paramName.includes('start_box') || paramName.includes('end_box')) {
            // Remove brackets/parentheses and split by comma
            const numbers = trimmedParam
              .replace(/[()[\]]/g, '')
              .split(',')
              .filter((n) => n.trim() !== '');

            // Normalize coordinate elements to floats in [0, 1] range
            const floatNumbers = numbers.map((num, idx) => {
              const factorIndex = idx % 2; // 0 is x (width), 1 is y (height)
              const smartFactor = smartResizeFactors ? smartResizeFactors[factorIndex] : undefined;
              const divider =
                modelVer === 'v1.5' && smartFactor !== undefined
                  ? smartFactor
                  : (factors[factorIndex] ?? 1000);
              const parsed = Number.parseFloat(num);
              const val = parsed / divider;
              return Number.isNaN(val) ? 0 : val;
            });

            // If it's a point (2 numbers), duplicate it to form a 4-number bbox
            if (
              floatNumbers.length === 2 &&
              floatNumbers[0] !== undefined &&
              floatNumbers[1] !== undefined
            ) {
              floatNumbers.push(floatNumbers[0], floatNumbers[1]);
            }

            actionInputs[paramName.trim()] = JSON.stringify(floatNumbers);

            // If we have screen dimensions, map normalized float coordinates back to pixels
            if (screenContext?.width && screenContext?.height) {
              const boxKey = paramName.includes('start_box') ? 'start_coords' : 'end_coords';
              const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = floatNumbers;

              const x1Val = Number.isNaN(x1) ? 0 : x1;
              const y1Val = Number.isNaN(y1) ? 0 : y1;
              const x2Val = Number.isNaN(x2) ? x1Val : x2;
              const y2Val = Number.isNaN(y2) ? y1Val : y2;

              // Compute physical pixel mid-point
              const physX = Math.round(((x1Val + x2Val) / 2) * screenContext.width * scaleFactor);
              const physY = Math.round(((y1Val + y2Val) / 2) * screenContext.height * scaleFactor);

              actionInputs[boxKey] = [physX, physY];
            }
          } else {
            actionInputs[paramName.trim()] = trimmedParam;
          }
        }
      } else {
        // Fallback for custom or direct strings (e.g. click "Login button")
        actionType = 'unknown';
        actionInputs = { text: rawStr };
      }

      actions.push({
        reflection,
        thought: thought || '',
        action_type: actionType,
        action_inputs: actionInputs,
      });
    }

    return actions;
  }
}
