import { z } from 'zod';
export interface BaseOutputParser<T> {
    parse(text: string): T | Promise<T>;
}
/**
 * Parses conversational text, extracts JSON block, and parses into JS object.
 */
export declare class JSONOutputParser implements BaseOutputParser<any> {
    parse(text: string): any;
}
/**
 * Extracts standard XML tags from text and formats them into a key-value dictionary.
 */
export declare class XMLOutputParser implements BaseOutputParser<Record<string, string>> {
    parse(text: string): Record<string, string>;
}
/**
 * Parses bulleted or comma-separated lists into an array of trimmed strings.
 */
export declare class ListOutputParser implements BaseOutputParser<string[]> {
    parse(text: string): string[];
}
/**
 * Combines JSON output parsing with Zod schema verification and custom errors.
 */
export declare class StructuredOutputParser<T> implements BaseOutputParser<T> {
    readonly schema: z.ZodType<T>;
    private jsonParser;
    constructor(schema: z.ZodType<T>);
    static fromZodSchema<S>(schema: z.ZodType<S>): StructuredOutputParser<S>;
    parse(text: string): T;
}
//# sourceMappingURL=parsers.d.ts.map