// ==============================================================================
// GHITA CODING AGENT - Prompt Templates & Prompt Management (STT 2.6, 2.10)
// ==============================================================================
/**
 * Universal template renderer supporting both {{variable}} and {variable} patterns.
 */
export function renderTemplate(template, variables) {
    return template.replace(/(?:\{\{([^{}]+)\}\})|(?:\{([^{}]+)\})/g, (match, p1, p2) => {
        const varName = (p1 || p2 || '').trim();
        if (variables[varName] !== undefined) {
            return String(variables[varName]);
        }
        return match; // Keep unresolved variables
    });
}
// ------------------------------------------------------------------------------
// 2.10 Prompt Templates
// ------------------------------------------------------------------------------
/**
 * Basic String Prompt Template
 */
export class PromptTemplate {
    template;
    inputVariables;
    constructor(template, inputVariables) {
        this.template = template;
        this.inputVariables = inputVariables;
    }
    format(variables) {
        return renderTemplate(this.template, variables);
    }
}
export class ChatPromptTemplate {
    messages;
    inputVariables;
    constructor(messages, inputVariables) {
        this.messages = messages;
        this.inputVariables = inputVariables;
    }
    formatMessages(variables) {
        return this.messages.map((msg) => ({
            role: msg.role,
            content: renderTemplate(msg.template, variables),
        }));
    }
}
export class FewShotPromptTemplate {
    examples;
    examplePrompt;
    prefix;
    suffix;
    exampleSeparator;
    constructor(options) {
        this.examples = options.examples;
        this.examplePrompt = options.examplePrompt;
        this.prefix = options.prefix;
        this.suffix = options.suffix;
        this.exampleSeparator = options.exampleSeparator !== undefined ? options.exampleSeparator : '\n\n';
    }
    format(variables) {
        const formattedExamples = this.examples
            .map((ex) => this.examplePrompt.format(ex))
            .join(this.exampleSeparator);
        const fullTemplate = `${this.prefix}${this.exampleSeparator}${formattedExamples}${this.exampleSeparator}${this.suffix}`;
        return renderTemplate(fullTemplate, variables);
    }
}
/**
 * Pipeline Prompt Template: composes multiple sub-prompts dynamically
 */
export class PipelinePromptTemplate {
    finalPrompt;
    pipelinePrompts;
    constructor(finalPrompt, pipelinePrompts) {
        this.finalPrompt = finalPrompt;
        this.pipelinePrompts = pipelinePrompts;
    }
    format(variables) {
        const resolvedVars = { ...variables };
        for (const sub of this.pipelinePrompts) {
            resolvedVars[sub.parameterName] = sub.prompt.format(variables);
        }
        return this.finalPrompt.format(resolvedVars);
    }
}
// ------------------------------------------------------------------------------
// 2.6 Prompt Management (PromptManager)
// ------------------------------------------------------------------------------
export class PromptManager {
    registry = new Map();
    register(name, template, version = 'latest') {
        if (!this.registry.has(name)) {
            this.registry.set(name, new Map());
        }
        const versions = this.registry.get(name);
        versions.set(version, template);
        // If registering for the first time or as 'latest', also save as 'default' or update latest
        if (version !== 'latest') {
            if (!versions.has('latest')) {
                versions.set('latest', template);
            }
        }
        else {
            // If setting 'latest' specifically, make sure it is stored
            versions.set('latest', template);
        }
    }
    get(name, version = 'latest') {
        const versions = this.registry.get(name);
        if (!versions) {
            throw new Error(`Prompt template "${name}" not found`);
        }
        const template = versions.get(version);
        if (!template) {
            // Fallback to latest if specific version is missing
            const latest = versions.get('latest');
            if (!latest) {
                throw new Error(`Prompt template "${name}" version "${version}" not found`);
            }
            return latest;
        }
        return template;
    }
    delete(name, version) {
        if (version) {
            const versions = this.registry.get(name);
            if (versions) {
                versions.delete(version);
                if (versions.size === 0) {
                    this.registry.delete(name);
                }
            }
        }
        else {
            this.registry.delete(name);
        }
    }
    clear() {
        this.registry.clear();
    }
}
//# sourceMappingURL=prompt.js.map