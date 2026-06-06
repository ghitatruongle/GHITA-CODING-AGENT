# 12-Factor Prompts as Code Specification

Treating prompts as first-class code is one of the core architectural pillars of building production-grade, reliable AI agents (specifically adhering to the **Own Your Prompts** factor). This specification defines the schema, validations, and practices for designing YAML-defined prompts.

---

## 1. Directory Structure

All prompt templates must be stored in a dedicated directory and versioned using semantic suffixing or defined in version-controlled configurations:

```
packages/ai-engine/prompts/
├── system_agent.v1.0.0.yaml
├── system_agent.v1.1.0.yaml
├── code_generator.v1.0.0.yaml
└── task_analyzer.v1.0.0.yaml
```

---

## 2. YAML File Structure

Each prompt is defined in a YAML file containing three primary sections:
1. `config`: Metadata, input variable definitions, and model parameters.
2. `template`: The raw multiline template string.
3. `validator`: Formatting constraints and safety filters.

### Example Schema

```yaml
config:
  name: "task_analyzer"
  version: "1.0.0"
  description: "Analyzes user query and suggests required tools"
  provider: "openai"       # Suggests primary provider
  model: "gpt-4o"          # Suggests target model
  temperature: 0.2
  maxTokens: 1000
  inputs:
    - name: "query"
      type: "string"
      required: true
      description: "The input query from the user"
    - name: "history"
      type: "array"
      required: false
      default: []
      description: "Previous messages for context"

template: |
  You are a professional task analyzer agent.
  Analyze the user query and recommend next tools.
  
  Context History:
  {{history}}
  
  User Query:
  {{query}}

validator:
  length:
    min: 20
    max: 5000
  format:
    pattern: "^You are.*"  # Matches starting template instructions
  safety:
    blockWords:
      - "override instruct"
      - "ignore system"
    enablePromptInjectionCheck: true
```

---

## 3. Schema & Validation Details

### Input Validation
Input variables are verified *before* the template is rendered:
- **Missing Required Variables**: Throws a `PromptValidationError`.
- **Type Compatibility**: Checked against specified types: `string`, `number`, `boolean`, `array`, `object`.
- **Default Values**: If a variable is omitted but has a defined `default`, it is injected automatically.

### Output Validation
Rendered strings are scanned *after* the variables are compiled:
- **Min/Max Length**: Ensures prompts stay within target limits to prevent context bloat.
- **Pattern Matching**: Guarantees output structure fits requirements.
- **Block Words**: Rejects output strings containing forbidden instructions or tokens.
- **Prompt Injection Defense**: Scans for patterns attempting to bypass instructions (e.g., "ignore previous instructions", "you are now"). Rejects and throws an `AISecurityGuardrailError` if triggered.

---

## 4. Integration Guidelines

### Registry Retrieval
Prompts must be loaded via the `PromptRegistry` class:
```typescript
import { PromptRegistry } from '@ghita/ai-engine';

const registry = new PromptRegistry();
registry.loadDirectory('./prompts');

// Always returns the highest version if 'latest' is specified
const rendered = registry.render('task_analyzer', 'latest', {
  query: "Write a test file",
});
```

### Hot Reloading
During local development, folder watching ensures changes in `.yaml` files reload in-process immediately:
```typescript
registry.watchDirectory('./prompts');
```
This reduces roundtrip feedback loop latency for developers adjusting instructions.
