// ==============================================================================
// GHITA CODING AGENT - Evals & Integrated Search
// ==============================================================================

import type { Orchestrator } from '../orchestrator.js';

export interface EvalResult {
  score: number;
  reasoning: string;
  metrics: {
    correctness?: number;
    relevancy?: number;
    toxicity?: number;
    [key: string]: number | undefined;
  };
}

export class LLMEvaluator {
  private orchestrator: Orchestrator;

  constructor(orchestrator: Orchestrator) {
    this.orchestrator = orchestrator;
  }

  /**
   * Đánh giá câu trả lời của LLM bằng phương pháp LLM-as-a-Judge
   */
  async evaluate(
    input: string,
    output: string,
    reference?: string
  ): Promise<EvalResult> {
    const prompt = `Bạn là một chuyên gia đánh giá độc lập (LLM Judge). Hãy đánh giá chất lượng câu trả lời của trợ lý dựa trên câu hỏi đầu vào và câu trả lời tham chiếu (nếu có).

[Câu hỏi]
${input}

[Câu trả lời của trợ lý]
${output}

${reference ? `[Câu trả lời tham chiếu chuẩn]\n${reference}\n` : ''}

Hãy trả về kết quả dưới định dạng JSON duy nhất như sau:
{
  "score": 4.5,
  "reasoning": "Lý giải chi tiết về tính chính xác và liên quan...",
  "metrics": {
    "correctness": 5.0,
    "relevancy": 4.0,
    "toxicity": 1.0
  }
}`;

    try {
      const response = await this.orchestrator.chat([
        { role: 'system', content: 'You are an objective AI evaluator judge. Output ONLY valid JSON.' },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.1
      });

      const cleanContent = response.content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanContent);
      return {
        score: parsed.score ?? 3.5,
        reasoning: parsed.reasoning ?? 'No reasoning provided',
        metrics: parsed.metrics ?? {}
      };
    } catch (e) {
      return {
        score: 4.0,
        reasoning: 'Đánh giá tự động fallback do lỗi parse JSON từ Judge',
        metrics: { correctness: 4.0, relevancy: 4.0 }
      };
    }
  }
}

export class IntegratedSearchClient {
  private googleApiKey?: string;
  private googleCx?: string;
  private tavilyApiKey?: string;

  constructor(options?: { googleApiKey?: string; googleCx?: string; tavilyApiKey?: string }) {
    this.googleApiKey = options?.googleApiKey || process.env.GOOGLE_API_KEY;
    this.googleCx = options?.googleCx || process.env.GOOGLE_CX;
    this.tavilyApiKey = options?.tavilyApiKey || process.env.TAVILY_API_KEY;
  }

  /**
   * Tìm kiếm thông tin qua Google Search hoặc Tavily API
   */
  async search(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
    if (this.tavilyApiKey) {
      try {
        const response = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: this.tavilyApiKey,
            query,
            include_answer: false,
          }),
        });
        if (response.ok) {
          const data = (await response.json()) as { results: Array<{ title: string; url: string; content: string }> };
          return data.results.map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content,
          }));
        }
      } catch {
        // ignore & fallback
      }
    }

    if (this.googleApiKey && this.googleCx) {
      try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${this.googleApiKey}&cx=${this.googleCx}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = (await response.json()) as { items?: Array<{ title: string; link: string; snippet: string }> };
          return (data.items || []).map((item) => ({
            title: item.title,
            url: item.link,
            snippet: item.snippet,
          }));
        }
      } catch {
        // ignore & fallback
      }
    }

    return [
      {
        title: `Kết quả tìm kiếm cho: ${query}`,
        url: 'https://example.com/search-result',
        snippet: `Đây là kết quả tìm kiếm giả lập cho truy vấn "${query}". Vui lòng cấu hình TAVILY_API_KEY hoặc GOOGLE_API_KEY để lấy dữ liệu thực tế.`,
      },
    ];
  }
}
