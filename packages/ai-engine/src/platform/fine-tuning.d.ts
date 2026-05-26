export declare class FineTuningManager {
    private apiKey;
    private baseUrl;
    constructor(options?: {
        apiKey?: string;
        baseUrl?: string;
    });
    private getHeaders;
    createJob(trainingFile: string, model: string): Promise<any>;
    listJobs(limit?: number): Promise<any>;
    retrieveJob(jobId: string): Promise<any>;
    cancelJob(jobId: string): Promise<any>;
}
//# sourceMappingURL=fine-tuning.d.ts.map