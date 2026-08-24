export type PromptInputType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface PromptInputSpec {
  name: string;
  type: PromptInputType;
  required: boolean;
  default?: unknown;
  description?: string;
}

export interface PromptConfig {
  name: string;
  version: string;
  description?: string;
  inputs: PromptInputSpec[];
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface PromptLengthValidator {
  min?: number;
  max?: number;
}

export interface PromptFormatValidator {
  pattern?: string;
  jsonSchema?: Record<string, unknown>;
}

export interface PromptSafetyValidator {
  blockWords?: string[];
  allowWords?: string[];
  enablePromptInjectionCheck?: boolean;
}

export interface PromptValidator {
  length?: PromptLengthValidator;
  format?: PromptFormatValidator;
  safety?: PromptSafetyValidator;
}

export interface PromptDefinition {
  config: PromptConfig;
  template: string;
  validator?: PromptValidator;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}
