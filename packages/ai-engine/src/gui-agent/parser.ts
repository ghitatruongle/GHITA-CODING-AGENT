import type { GuiAction, ActionType } from './types.js';

/**
 * Validates a parsed GUI action's parameters.
 * Throws an error if required fields are missing or of incorrect types.
 */
export function validateGuiAction(action: Partial<GuiAction>, index = 0): GuiAction {
  if (!action.type) {
    throw new Error(`[Action ${index}] Action type is missing`);
  }

  const validTypes: ActionType[] = [
    'click',
    'double_click',
    'right_click',
    'drag',
    'move_to',
    'type',
    'keypress',
    'hotkey',
    'scroll',
    'wait',
  ];

  if (!validTypes.includes(action.type)) {
    throw new Error(`[Action ${index}] Invalid action type: "${action.type}"`);
  }

  const params = action.params || {};

  switch (action.type) {
    case 'click':
    case 'double_click':
    case 'right_click':
    case 'move_to': {
      const x = Number(params.x);
      const y = Number(params.y);
      if (isNaN(x) || isNaN(y)) {
        throw new Error(`[Action ${index}] "${action.type}" requires numeric coordinates (x, y)`);
      }
      return {
        type: action.type,
        params: {
          x,
          y,
          button: params.button || 'left',
        },
      };
    }

    case 'drag': {
      // support both fromX/toX and x1/x2 naming styles
      const fromX = Number(params.fromX !== undefined ? params.fromX : params.x1);
      const fromY = Number(params.fromY !== undefined ? params.fromY : params.y1);
      const toX = Number(params.toX !== undefined ? params.toX : params.x2);
      const toY = Number(params.toY !== undefined ? params.toY : params.y2);

      if (isNaN(fromX) || isNaN(fromY) || isNaN(toX) || isNaN(toY)) {
        throw new Error(`[Action ${index}] "drag" requires numeric coordinates (fromX, fromY, toX, toY)`);
      }
      return {
        type: 'drag',
        params: { fromX, fromY, toX, toY },
      };
    }

    case 'type': {
      if (params.text === undefined || params.text === null) {
        throw new Error(`[Action ${index}] "type" requires a text string`);
      }
      return {
        type: 'type',
        params: { text: String(params.text) },
      };
    }

    case 'keypress': {
      if (!params.key || typeof params.key !== 'string') {
        throw new Error(`[Action ${index}] "keypress" requires a string key`);
      }
      return {
        type: 'keypress',
        params: { key: params.key },
      };
    }

    case 'hotkey': {
      let keys: string[] = [];
      if (Array.isArray(params.keys)) {
        keys = params.keys.map(String);
      } else if (typeof params.keys === 'string') {
        keys = params.keys.split('+').map((k) => k.trim());
      } else if (params.key && typeof params.key === 'string') {
        keys = [params.key];
      } else {
        throw new Error(`[Action ${index}] "hotkey" requires an array of keys or a "+"-separated key string`);
      }
      return {
        type: 'hotkey',
        params: { keys },
      };
    }

    case 'scroll': {
      const amount = Number(params.amount);
      const direction = String(params.direction || 'down').toLowerCase();
      const validDirections = ['up', 'down', 'left', 'right'];

      if (isNaN(amount)) {
        throw new Error(`[Action ${index}] "scroll" requires a numeric amount`);
      }
      if (!validDirections.includes(direction)) {
        throw new Error(`[Action ${index}] "scroll" direction must be one of: ${validDirections.join(', ')}`);
      }
      return {
        type: 'scroll',
        params: { amount, direction },
      };
    }

    case 'wait': {
      const ms = Number(params.ms !== undefined ? params.ms : params.duration);
      if (isNaN(ms) || ms < 0) {
        throw new Error(`[Action ${index}] "wait" requires a positive numeric duration (ms)`);
      }
      return {
        type: 'wait',
        params: { ms },
      };
    }

    default:
      throw new Error(`[Action ${index}] Unimplemented validation for: ${action.type}`);
  }
}

/**
 * Parses GUI actions from the model output.
 * Tries JSON extraction, XML tag extraction, and function directive parsing.
 */
export function parseModelOutput(output: string): GuiAction[] {
  const actions: GuiAction[] = [];

  if (!output || output.trim() === '') {
    return actions;
  }

  // 1. Try to find and parse JSON blocks
  const jsonRegex = /```json\s*([\s\S]*?)\s*```/g;
  let match;
  let hasJson = false;

  while ((match = jsonRegex.exec(output)) !== null) {
    try {
      const parsed = JSON.parse(match[1] || '');
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          actions.push(validateGuiAction(item, actions.length));
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        actions.push(validateGuiAction(parsed, actions.length));
      }
      hasJson = true;
    } catch {
      // Ignore invalid JSON inside markdown blocks
    }
  }

  // If no JSON block matches, try parsing the entire output as JSON
  if (!hasJson) {
    try {
      const parsed = JSON.parse(output.trim());
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          actions.push(validateGuiAction(item, actions.length));
        }
        return actions;
      } else if (typeof parsed === 'object' && parsed !== null) {
        actions.push(validateGuiAction(parsed, actions.length));
        return actions;
      }
    } catch {
      // Fall through to other parsers
    }
  }

  // 2. Try to find and parse XML tags: e.g. <action type="click"><x>100</x><y>200</y></action>
  // or <gui_action><type>click</type>...</gui_action>
  const xmlActionRegex = /<(?:action|gui_action)\b([^>]*)>([\s\S]*?)<\/(?:action|gui_action)>/g;
  let xmlMatch;
  let hasXml = false;

  while ((xmlMatch = xmlActionRegex.exec(output)) !== null) {
    try {
      const attrsStr = xmlMatch[1] || '';
      const bodyStr = xmlMatch[2] || '';

      const action: Partial<GuiAction> = {};
      const params: Record<string, unknown> = {};

      // Parse type from attributes
      const typeAttrMatch = /\btype=["']([^"']+)["']/.exec(attrsStr) || /\bname=["']([^"']+)["']/.exec(attrsStr);
      if (typeAttrMatch) {
        action.type = typeAttrMatch[1] as ActionType;
      }

      // Parse elements from body
      const tagRegex = /<([a-zA-Z0-9_]+)>([^<]*)<\/\1>/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(bodyStr)) !== null) {
        const key = tagMatch[1];
        const val = tagMatch[2]?.trim();
        if (key && val) {
          if (key === 'type' && !action.type) {
            action.type = val as ActionType;
          } else {
            params[key] = isNaN(Number(val)) ? val : Number(val);
          }
        }
      }

      action.params = params;
      actions.push(validateGuiAction(action, actions.length));
      hasXml = true;
    } catch {
      // Ignore malformed XML tags
    }
  }

  if (hasXml && actions.length > 0) {
    return actions;
  }

  // 3. Fallback: Parse function-like text directives line-by-line:
  // e.g. click(100, 200), type("hello"), wait(1000)
  const lines = output.split('\n');
  const directiveRegex = /\b(click|double_click|right_click|drag|move_to|type|keypress|hotkey|scroll|wait)\s*\(([^)]*)\)/gi;

  for (const line of lines) {
    let lineMatch;
    while ((lineMatch = directiveRegex.exec(line)) !== null) {
      try {
        const type = lineMatch[1]?.toLowerCase() as ActionType;
        const argsStr = lineMatch[2] || '';

        // Split args by comma, respecting quoted strings
        const args: string[] = [];
        let currentArg = '';
        let inQuotes = false;
        let quoteChar = '';

        for (let i = 0; i < argsStr.length; i++) {
          const char = argsStr[i];
          if ((char === '"' || char === "'") && (i === 0 || argsStr[i - 1] !== '\\')) {
            if (inQuotes && char === quoteChar) {
              inQuotes = false;
            } else if (!inQuotes) {
              inQuotes = true;
              quoteChar = char;
            }
          } else if (char === ',' && !inQuotes) {
            args.push(currentArg.trim());
            currentArg = '';
          } else {
            currentArg += char;
          }
        }
        args.push(currentArg.trim());

        // Process args into params
        const params: Record<string, unknown> = {};

        // Helper to strip quotes
        const stripQuotes = (str: string) => {
          if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
            return str.slice(1, -1);
          }
          return str;
        };

        if (type === 'click' || type === 'double_click' || type === 'right_click' || type === 'move_to') {
          params.x = Number(args[0]);
          params.y = Number(args[1]);
          if (args[2]) {
            params.button = stripQuotes(args[2]);
          }
        } else if (type === 'drag') {
          params.fromX = Number(args[0]);
          params.fromY = Number(args[1]);
          params.toX = Number(args[2]);
          params.toY = Number(args[3]);
        } else if (type === 'type') {
          params.text = stripQuotes(args[0] || '');
        } else if (type === 'keypress') {
          params.key = stripQuotes(args[0] || '');
        } else if (type === 'hotkey') {
          params.keys = args.map(stripQuotes);
        } else if (type === 'scroll') {
          params.amount = Number(args[0]);
          if (args[1]) {
            params.direction = stripQuotes(args[1]);
          }
        } else if (type === 'wait') {
          params.ms = Number(args[0]);
        }

        actions.push(validateGuiAction({ type, params }, actions.length));
      } catch {
        // Skip malformed function directives
      }
    }
  }

  return actions;
}
