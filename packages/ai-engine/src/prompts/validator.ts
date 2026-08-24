import type { PromptInputSpec, PromptValidator, ValidationResult } from './types.js';

export class PromptValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Prompt validation failed:\n- ${errors.join('\n- ')}`);
    this.name = 'PromptValidationError';
  }
}

/**
 * Validates input variables against the configuration input spec.
 * Sets default values if variables are missing.
 */
export function validateInput(
  inputsSpec: PromptInputSpec[],
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const validated: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const spec of inputsSpec) {
    const value = variables[spec.name];

    if (value === undefined || value === null) {
      if (spec.required) {
        errors.push(`Missing required input variable: "${spec.name}"`);
      } else {
        validated[spec.name] = spec.default !== undefined ? spec.default : '';
      }
      continue;
    }

    // Type checking
    let typeMatched = false;
    switch (spec.type) {
      case 'string':
        typeMatched = typeof value === 'string';
        break;
      case 'number':
        typeMatched = typeof value === 'number';
        break;
      case 'boolean':
        typeMatched = typeof value === 'boolean';
        break;
      case 'array':
        typeMatched = Array.isArray(value);
        break;
      case 'object':
        typeMatched = typeof value === 'object' && value !== null && !Array.isArray(value);
        break;
      default:
        typeMatched = true; // Unknown type fallback
    }

    if (!typeMatched) {
      errors.push(
        `Input variable "${spec.name}" must be of type "${spec.type}", received "${typeof value}"`,
      );
    } else {
      validated[spec.name] = value;
    }
  }

  if (errors.length > 0) {
    throw new PromptValidationError(errors);
  }

  // Pass through any other fields not specified in inputs spec, just in case
  for (const [key, val] of Object.entries(variables)) {
    if (!(key in validated)) {
      validated[key] = val;
    }
  }

  return validated;
}

/**
 * Validates the final rendered prompt string against configured safety and length rules.
 */
export function validateOutput(
  validatorSpec: PromptValidator | undefined,
  renderedPrompt: string,
): ValidationResult {
  if (!validatorSpec) {
    return { valid: true };
  }

  const errors: string[] = [];

  // 1. Length validation
  if (validatorSpec.length) {
    const { min, max } = validatorSpec.length;
    const len = renderedPrompt.length;
    if (min !== undefined && len < min) {
      errors.push(`Rendered prompt length (${len}) is below minimum allowed (${min})`);
    }
    if (max !== undefined && len > max) {
      errors.push(`Rendered prompt length (${len}) exceeds maximum allowed (${max})`);
    }
  }

  // 2. Format / Pattern validation
  if (validatorSpec.format) {
    const { pattern, jsonSchema } = validatorSpec.format;
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(renderedPrompt)) {
          errors.push(`Rendered prompt does not match required format pattern: ${pattern}`);
        }
      } catch (err: unknown) {
        errors.push(
          `Invalid format regex pattern: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (jsonSchema) {
      // Simple parse attempt if schema is defined
      try {
        JSON.parse(renderedPrompt);
      } catch (err) {
        errors.push(`Rendered prompt is not valid JSON as required by schema`);
      }
    }
  }

  // 3. Safety validation
  if (validatorSpec.safety) {
    const { blockWords, allowWords, enablePromptInjectionCheck } = validatorSpec.safety;

    if (blockWords && blockWords.length > 0) {
      const lowerPrompt = renderedPrompt.toLowerCase();
      for (const word of blockWords) {
        const lowerWord = word.toLowerCase();
        // Skip check if it is explicitly in allowWords
        if (allowWords && allowWords.some((aw) => aw.toLowerCase() === lowerWord)) {
          continue;
        }
        if (lowerPrompt.includes(lowerWord)) {
          errors.push(`Rendered prompt contains blocked word/phrase: "${word}"`);
        }
      }
    }

    if (enablePromptInjectionCheck) {
      const injectionKeywords = [
        'ignore previous instructions',
        'ignore above',
        'ignore the instructions',
        'system override',
        'you are now',
        'new system instruction',
        'delete memory',
        'override instructions',
      ];
      const lowerPrompt = renderedPrompt.toLowerCase();
      for (const keyword of injectionKeywords) {
        if (lowerPrompt.includes(keyword)) {
          errors.push(
            `Prompt injection attempt detected: contains instruction override keyword "${keyword}"`,
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}
