// ==============================================================================
// GHITA CODING AGENT - Files & Batches Manager
// ==============================================================================

export class FilesManager {
  private apiKey: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
  }

  private getHeaders(multipart = false) {
    if (!this.apiKey) {
      throw new Error('FilesManager: API key is not configured');
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (!multipart) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async uploadFile(file: Buffer, purpose: string, filename = 'file.jsonl'): Promise<Record<string, unknown>> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file)], { type: 'application/octet-stream' });
    formData.append('file', blob, filename);
    formData.append('purpose', purpose);

    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'POST',
      headers: this.getHeaders(true),
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Files API error: ${error}`);
    }

    return await response.json();
  }

  async listFiles(): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/files`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Files API error: ${error}`);
    }

    return await response.json();
  }

  async deleteFile(fileId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Files API error: ${error}`);
    }

    return await response.json();
  }
}

export class BatchesManager {
  private apiKey: string;
  private baseUrl: string;

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
  }

  private getHeaders() {
    if (!this.apiKey) {
      throw new Error('BatchesManager: API key is not configured');
    }
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async createBatch(fileId: string, endpoint: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/batches`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        input_file_id: fileId,
        endpoint,
        completion_window: '24h',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batches API error: ${error}`);
    }

    return await response.json();
  }

  async retrieveBatch(batchId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/batches/${batchId}`, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batches API error: ${error}`);
    }

    return await response.json();
  }

  async cancelBatch(batchId: string): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}/batches/${batchId}/cancel`, {
      method: 'POST',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Batches API error: ${error}`);
    }

    return await response.json();
  }
}
