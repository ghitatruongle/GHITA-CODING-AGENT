export interface FetchResponse {
    url: string;
    title: string;
    content: string;
    contentType: string;
    statusCode: number;
}
export declare class WebFetchTool {
    /** Fetch URL và convert sang markdown-ish text */
    fetch(url: string): Promise<FetchResponse>;
    /** Extract title from HTML */
    private extractTitle;
    /** Convert HTML to readable text */
    private htmlToText;
}
//# sourceMappingURL=web-fetch.d.ts.map