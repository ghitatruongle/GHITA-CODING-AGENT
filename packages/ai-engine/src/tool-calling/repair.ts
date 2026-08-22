// ==============================================================================
// GHITA CODING AGENT - AI Engine v1.1.0 Track 4 P49: tool-call argument repair
// ==============================================================================
// Repairs malformed tool-call arguments (broken JSON, type mismatches, missing
// required fields) before execution — mirroring the AI SDK tool-call-repair
// pattern. Safe: never invents values; fills typed defaults when the schema
// declares the field required and the value is missing.
// ==============================================================================

export interface ToolArgSchema {
  type?: 'object';
  properties?: Record<string, { type?: string; default?: unknown; description?: string }>;
  required?: string[];
}

export interface RepairResult {
  /** Usable arguments (repaired or original if already valid). */
  args: Record<string, unknown>;
  /** True when any repair was applied. */
  repaired: boolean;
  issues: string[];
}

/** Parse raw tool arguments (string JSON or object), fixing common JSON errors. */
export function parseToolArguments(raw: unknown): {
  args: Record<string, unknown>;
  issues: string[];
} {
  const issues: string[] = [];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { args: raw as Record<string, unknown>, issues };
  }
  if (typeof raw !== 'string') {
    return { args: {}, issues: ['arguments are neither object nor string'] };
  }
  const text = raw.trim();
  if (!text) return { args: {}, issues: ['empty arguments'] };

  // 1. Strict parse first.
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { args: parsed as Record<string, unknown>, issues };
    }
    issues.push('arguments parsed but not an object');
    return { args: {}, issues };
  } catch {
    issues.push('invalid JSON');
  }

  // 2. Lightweight fixes: strip markdown fences, trailing commas/semicolons, unquoted keys.
  const fixed = text
    .replace(/^```(?:json)?\s*|\s*```$/g, '')
    .replace(/[;,](\s*[}\]])/g, '$1')
    .replace(/;\s*(?=")/g, ',')
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
  try {
    const parsed = JSON.parse(fixed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { args: parsed as Record<string, unknown>, issues };
    }
  } catch {
    issues.push('repair JSON still invalid');
  }
  return { args: {}, issues };
}

/** Coerce a value to the schema-declared type when clearly mismatched. */
function coerceValue(value: unknown, type: string | undefined): unknown {
  switch (type) {
    case 'string':
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value) && value.length === 1) return String(value[0]);
      return value;
    case 'number':
      if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : value;
      }
      return value;
    case 'boolean':
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    case 'array':
      return Array.isArray(value) ? value : typeof value === 'string' ? [value] : value;
    case 'object':
      return value && typeof value === 'object' && !Array.isArray(value) ? value : value;
    default:
      return value;
  }
}

/**
 * Repair tool-call arguments against an optional JSON-schema-shaped definition.
 */
export function repairToolCallArguments(raw: unknown, schema?: ToolArgSchema): RepairResult {
  const { args, issues } = parseToolArguments(raw);
  const result: RepairResult = { args, repaired: issues.length > 0, issues: [...issues] };

  if (!schema || !schema.properties) return result;

  let changed = result.repaired;
  const out = { ...result.args };

  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = out[key];
    if (value === undefined) {
      if (schema.required?.includes(key)) {
        if (prop.default !== undefined) {
          out[key] = prop.default;
          changed = true;
          result.issues.push(`filled required field "${key}" with declared default`);
        } else {
          result.issues.push(`missing required field "${key}"`);
        }
      }
      continue;
    }
    const coerced = coerceValue(value, prop.type);
    if (coerced !== value) {
      out[key] = coerced;
      changed = true;
      result.issues.push(`coerced field "${key}" to ${prop.type ?? 'unknown'} type`);
    }
  }

  return { args: out, repaired: changed, issues: result.issues };
}

/** True when a repaired call should be retried (still usable). */
export function isRetryableRepair(result: RepairResult): boolean {
  return !result.issues.some(
    (i) => i.startsWith('repair JSON still invalid') || i.startsWith('arguments parsed but not'),
  );
}

/**
 * Auto-closes unclosed JSON strings, arrays, and objects for partial streaming responses.
 */
export function repairIncompleteJson(jsonStr: string): string {
  let s = jsonStr.trim();
  if (!s) return '{}';

  // Strip leading/trailing markdown fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
  }

  // If ended inside a string, close it
  if (inString) {
    s += '"';
  }

  // Remove dangling commas before closing brackets
  s = s.replace(/,\s*$/, '');

  // Close remaining open brackets
  while (stack.length > 0) {
    s += stack.pop();
  }

  return s;
}

/**
 * Accumulate streaming string chunks and parse into safe tool call arguments.
 */
export async function accumulateToolStream(
  stream: AsyncIterable<string>,
  schema?: ToolArgSchema,
): Promise<RepairResult> {
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;
  }
  const repairedJson = repairIncompleteJson(buffer);
  return repairToolCallArguments(repairedJson, schema);
}
