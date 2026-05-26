export declare class FilesManager {
    private apiKey;
    private baseUrl;
    constructor(options?: {
        apiKey?: string;
        baseUrl?: string;
    });
    private getHeaders;
    uploadFile(file: Buffer, purpose: string, filename?: string): Promise<any>;
    listFiles(): Promise<any>;
    deleteFile(fileId: string): Promise<any>;
}
export declare class BatchesManager {
    private apiKey;
    private baseUrl;
    constructor(options?: {
        apiKey?: string;
        baseUrl?: string;
    });
    private getHeaders;
    createBatch(fileId: string, endpoint: string): Promise<any>;
    retrieveBatch(batchId: string): Promise<any>;
    cancelBatch(batchId: string): Promise<any>;
}
//# sourceMappingURL=files-batches.d.ts.map