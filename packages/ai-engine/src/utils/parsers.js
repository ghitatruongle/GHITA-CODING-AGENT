// ==============================================================================
// GHITA CODING AGENT - Output Parsers (STT 2.11)
// ==============================================================================
import { AIValidationError } from '../errors/index.js';
import { extractJsonFromText } from './structured.js';
/**
 * Parses conversational text, extracts JSON block, and parses into JS object.
 */
export class JSONOutputParser {
    parse(text) {
        const jsonStr = extractJsonFromText(text);
        if (!jsonStr) {
            throw new Error('No JSON block found in response');
        }
        try {
            return JSON.parse(jsonStr);
        }
        catch (err) {
            throw new Error(`Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
/**
 * Extracts standard XML tags from text and formats them into a key-value dictionary.
 */
export class XMLOutputParser {
    parse(text) {
        const result = {};
        const regex = /<(\w+)(?:\s+[^>]*)*>([\s\S]*?)<\/\1>/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match[1] && match[2]) {
                result[match[1]] = match[2].trim();
            }
        }
        return result;
    }
}
/**
 * Parses bulleted or comma-separated lists into an array of trimmed strings.
 */
export class ListOutputParser {
    parse(text) {
        const lines = text.split('\n');
        const result = [];
        for (let line of lines) {
            line = line.trim();
            if (!line)
                continue;
            const bulletMatch = line.match(/^(?:[-*+]\s*|\d+\.\s*)(.*)$/);
            if (bulletMatch?.[1]) {
                result.push(bulletMatch[1].trim());
            }
            else {
                const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
                result.push(...parts);
            }
        }
        return result.filter(Boolean);
    }
}
/**
 * Combines JSON output parsing with Zod schema verification and custom errors.
 */
export class StructuredOutputParser {
    schema;
    jsonParser = new JSONOutputParser();
    constructor(schema) {
        this.schema = schema;
    }
    static fromZodSchema(schema) {
        return new StructuredOutputParser(schema);
    }
    parse(text) {
        let parsed;
        try {
            parsed = this.jsonParser.parse(text);
        }
        catch (err) {
            throw new AIValidationError('Zod Schema', text, [err], `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        const result = this.schema.safeParse(parsed);
        if (!result.success) {
            throw new AIValidationError('Zod Schema', text, result.error.errors, 'Structured output validation failed');
        }
        return result.data;
    }
}
//# sourceMappingURL=parsers.js.map