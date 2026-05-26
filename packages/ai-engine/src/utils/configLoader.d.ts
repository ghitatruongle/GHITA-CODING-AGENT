import type { ProviderConfig } from '../types.js';
export interface LocalConfig {
    agentModels: {
        [key: string]: {
            type: string;
            base_url?: string;
            api_key?: string;
            default_model?: string;
        };
    };
    agentRouting: {
        Explore: string;
        Plan: string;
        UI: string;
        default: string;
        [key: string]: string;
    };
}
export declare class ConfigLoader {
    private configPath;
    constructor();
    /**
     * Đọc cấu hình từ file ~/.openclaude.json
     */
    load(): LocalConfig;
    /**
     * Lưu cấu hình mới xuống file ~/.openclaude.json
     */
    save(config: LocalConfig): void;
    /**
     * Chuyển đổi LocalConfig sang mảng ProviderConfig của AI Engine
     */
    toProviderConfigs(localConfig: LocalConfig): ProviderConfig[];
    private initializeDefaultConfig;
}
//# sourceMappingURL=configLoader.d.ts.map