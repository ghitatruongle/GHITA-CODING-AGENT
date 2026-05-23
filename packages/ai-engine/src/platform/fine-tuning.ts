// ==============================================================================
// GHITA CODING AGENT - Fine-Tuning Manager
// ==============================================================================

export class FineTuningManager {
  private apiKey: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
  }

  private getHeaders() {
    if (!this.apiKey) {
      throw new Error('FineTuningManager: API key is not configured');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async createJob(trainingFile: string, model: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/fine_tuning/jobs`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        training_file: trainingFile,
        model,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fine-Tuning API error: ${error}`);
    }

    return await response.json();
  }

  async listJobs(limit?: number): Promise<any> {
    const url = new URL(`${this.baseUrl}/fine_tuning/jobs`);
    if (limit !== undefined) {
      url.searchParams.append('limit', String(limit));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fine-Tuning API error: ${error}`);
    }

    return await response.json();
  }

  async retrieveJob(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/fine_tuning/jobs/${jobId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fine-Tuning API error: ${error}`);
    }

    return await response.json();
  }

  async cancelJob(jobId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/fine_tuning/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Fine-Tuning API error: ${error}`);
    }

    return await response.json();
  }
}
