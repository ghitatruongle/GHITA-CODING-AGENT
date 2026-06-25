// ==============================================================================
// GHITA CODING AGENT - Template Customization Wizard (Phase 36)
// ==============================================================================

import type {
  AgentTemplate,
  AgentConfig,
  CustomizationOption,
  CustomizationValues,
  TemplateTool,
} from './types.js';

/** Validation error */
export interface ValidationError {
  key: string;
  message: string;
}

/** Customization result */
export interface CustomizationResult {
  success: boolean;
  template?: AgentTemplate;
  errors?: ValidationError[];
}

/**
 * Template Customization Wizard.
 * Applies user-customized values to a template, validates them,
 * and produces a ready-to-use agent configuration.
 */
export class TemplateCustomizer {
  /**
   * Apply customization values to a template.
   * Returns a new customized template without modifying the original.
   */
  customize(template: AgentTemplate, values: CustomizationValues): CustomizationResult {
    // Validate inputs
    const errors = this.validate(template.customizationOptions, values);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Clone template
    const customized: AgentTemplate = JSON.parse(JSON.stringify(template));

    // Apply values to customization options
    for (const option of customized.customizationOptions) {
      const value = values[option.key];
      if (value !== undefined) {
        option.defaultValue = value;
      }
    }

    // Apply system prompt variables
    customized.systemPrompt = this.interpolatePrompt(customized.systemPrompt, values);

    // Apply config overrides
    customized.config = this.applyConfigOverrides(customized.config, values);

    // Apply tool changes
    customized.tools = this.applyToolCustomizations(customized.tools, values);

    // Update metadata
    customized.id = `${template.id}-custom-${Date.now()}`;
    customized.updatedAt = Date.now();

    return { success: true, template: customized };
  }

  /**
   * Validate customization values against option definitions.
   */
  validate(options: CustomizationOption[], values: CustomizationValues): ValidationError[] {
    const errors: ValidationError[] = [];

    for (const option of options) {
      const value = values[option.key];

      // Check required
      if (option.validation?.required && (value === undefined || value === null || value === '')) {
        errors.push({ key: option.key, message: `${option.label} is required` });
        continue;
      }

      if (value === undefined || value === null) continue;

      // Type checking
      switch (option.type) {
        case 'number': {
          if (typeof value !== 'number') {
            errors.push({ key: option.key, message: `${option.label} must be a number` });
            continue;
          }
          if (option.validation?.min !== undefined && value < option.validation.min) {
            errors.push({
              key: option.key,
              message: `${option.label} must be >= ${option.validation.min}`,
            });
          }
          if (option.validation?.max !== undefined && value > option.validation.max) {
            errors.push({
              key: option.key,
              message: `${option.label} must be <= ${option.validation.max}`,
            });
          }
          break;
        }
        case 'text':
        case 'textarea': {
          if (typeof value !== 'string') {
            errors.push({ key: option.key, message: `${option.label} must be text` });
            continue;
          }
          if (option.validation?.pattern) {
            const regex = new RegExp(option.validation.pattern);
            if (!regex.test(value)) {
              errors.push({ key: option.key, message: `${option.label} format is invalid` });
            }
          }
          break;
        }
        case 'boolean': {
          if (typeof value !== 'boolean') {
            errors.push({ key: option.key, message: `${option.label} must be true/false` });
          }
          break;
        }
        case 'select': {
          if (option.choices && !option.choices.some((c) => c.value === value)) {
            errors.push({
              key: option.key,
              message: `${option.label} must be one of: ${option.choices.map((c) => c.value).join(', ')}`,
            });
          }
          break;
        }
        case 'multiselect': {
          if (!Array.isArray(value)) {
            errors.push({ key: option.key, message: `${option.label} must be an array` });
          }
          break;
        }
      }
    }

    return errors;
  }

  /**
   * Get default values for all customization options.
   */
  getDefaults(options: CustomizationOption[]): CustomizationValues {
    const defaults: CustomizationValues = {};
    for (const option of options) {
      defaults[option.key] = option.defaultValue;
    }
    return defaults;
  }

  /**
   * Preview what the customized system prompt would look like.
   */
  previewPrompt(template: AgentTemplate, values: CustomizationValues): string {
    return this.interpolatePrompt(template.systemPrompt, values);
  }

  // --- Private ---

  private interpolatePrompt(prompt: string, values: CustomizationValues): string {
    let result = prompt;
    for (const [key, value] of Object.entries(values)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(placeholder, String(value));
    }
    return result;
  }

  private applyConfigOverrides(config: AgentConfig, values: CustomizationValues): AgentConfig {
    const result: AgentConfig = { ...config };

    // Map common customization keys to config
    if (values['temperature'] !== undefined) {
      result.temperature = values['temperature'] as number | undefined;
    }
    if (values['maxTokens'] !== undefined) {
      result.maxTokens = values['maxTokens'] as number | undefined;
    }
    if (values['model'] !== undefined) {
      result.preferredModel = values['model'] as string | undefined;
    }
    if (values['provider'] !== undefined) {
      result.preferredProvider = values['provider'] as string | undefined;
    }
    if (values['streaming'] !== undefined) {
      result.streaming = values['streaming'] as boolean | undefined;
    }

    return result;
  }

  private applyToolCustomizations(
    tools: TemplateTool[],
    values: CustomizationValues,
  ): TemplateTool[] {
    let result = [...tools];

    // Enable/disable tools based on customization
    if (values['enabledTools'] && Array.isArray(values['enabledTools'])) {
      const enabledNames = values['enabledTools'] as string[];
      result = result.map((tool) => ({
        ...tool,
        required: enabledNames.includes(tool.name),
      }));
    }

    // Add extra tools
    if (values['extraTools'] && Array.isArray(values['extraTools'])) {
      const extras = values['extraTools'] as TemplateTool[];
      result.push(...extras);
    }

    return result;
  }
}
