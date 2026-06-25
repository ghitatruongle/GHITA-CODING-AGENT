// ==============================================================================
// GHITA CODING AGENT - Web Fetch Tool
// ==============================================================================

export interface FetchResponse {
  url: string;
  title: string;
  content: string;
  contentType: string;
  statusCode: number;
}

export class WebFetchTool {
  /** Fetch URL và convert sang markdown-ish text */
  async fetch(url: string): Promise<FetchResponse> {
    const response = await globalThis.fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'GHITA-Coding-Agent/0.1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? 'text/plain';
    const rawText = await response.text();

    let content: string;
    if (contentType.includes('text/html')) {
      content = this.htmlToText(rawText);
    } else {
      content = rawText;
    }

    // Truncate to prevent token overflow
    if (content.length > 8000) {
      content = `${content.substring(0, 8000)  }\n\n[Content truncated...]`;
    }

    return {
      url,
      title: this.extractTitle(rawText, contentType),
      content,
      contentType,
      statusCode: response.status,
    };
  }

  /** Extract title from HTML */
  private extractTitle(html: string, contentType: string): string {
    if (!contentType.includes('text/html')) return '';
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match?.[1]?.trim() ?? '';
  }

  /** Convert HTML to readable text */
  private htmlToText(html: string): string {
    let text = html;
    // Remove scripts, styles, nav, footer
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
    // Convert headers to markdown
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n');
    text = text.replace(/<h[4-6][^>]*>(.*?)<\/h[4-6]>/gi, '**$1**\n');
    // Convert links
    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    // Convert code blocks
    text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```');
    // Convert lists
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    // Convert paragraphs
    text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    // Convert line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Remove remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Decode HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');
    // Clean up whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();
    return text;
  }
}
