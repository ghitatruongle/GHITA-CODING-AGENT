import type { AIProviderType } from '@ghita/shared';
import type { AIProvider, ProviderConfig } from './types.js';
export declare class ProviderRegistry {
    private providers;
    /** Đăng ký một provider */
    register(provider: AIProvider): void;
    /** Tạo và đăng ký provider từ config */
    registerFromConfig(config: ProviderConfig): AIProvider;
    /** Lấy provider theo type */
    get(type: AIProviderType): AIProvider | undefined;
    /** Lấy tất cả providers */
    getAll(): AIProvider[];
    /** Lấy tất cả provider types đã đăng ký */
    getTypes(): AIProviderType[];
    /** Kiểm tra provider đã đăng ký chưa */
    has(type: AIProviderType): boolean;
    /** Xoá provider */
    remove(type: AIProviderType): boolean;
    /** Xoá tất cả */
    clear(): void;
    /** Lấy status của tất cả providers */
    getStatus(): Promise<Array<{
        type: AIProviderType;
        name: string;
        ready: boolean;
    }>>;
    private createProvider;
}
//# sourceMappingURL=registry.d.ts.map