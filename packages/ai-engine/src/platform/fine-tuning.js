// ==============================================================================
// GHITA CODING AGENT - Fine-Tuning Manager
// ==============================================================================
export class FineTuningManager {
    apiKey;
    baseUrl;
    constructor(options) {
        this.apiKey = options?.apiKey || process.env.OPENAI_API_KEY || '';
        this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
    }
    getHeaders() {
        if (!this.apiKey) {
            throw new Error('FineTuningManager: API key is not configured');
        }
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
        };
    }
    async createJob(trainingFile, model) {
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
    async listJobs(limit) {
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
    async retrieveJob(jobId) {
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
    async cancelJob(jobId) {
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
//# sourceMappingURL=fine-tuning.js.map