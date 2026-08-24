import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { ConfigLoader, type LocalConfig } from '../../packages/ai-engine/src/utils/configLoader.js';

// Mock module fs
vi.mock('fs');

describe('ConfigLoader (Dynamic Settings Profile Loader)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('nên tự động khởi tạo cấu hình mặc định khi file không tồn tại', () => {
    
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const loader = new ConfigLoader();
    const config = loader.load();

    expect(fs.existsSync).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled(); 
    expect(config.agentModels).toHaveProperty('openai-gpt-4o');
    expect(config.agentRouting.Plan).toBe('anthropic-sonnet');
  });

  it('nên nạp cấu hình chính xác từ file json đã tồn tại', () => {
    const mockData: LocalConfig = {
      agentModels: {
        'my-custom-model': {
          type: 'custom',
          base_url: 'https://api.custom.com/v1',
          default_model: 'custom-model-1',
        },
      },
      agentRouting: {
        Explore: 'my-custom-model',
        Plan: 'my-custom-model',
        UI: 'my-custom-model',
        default: 'my-custom-model',
      },
    };

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockData));

    const loader = new ConfigLoader();
    const config = loader.load();

    expect(fs.readFileSync).toHaveBeenCalled();
    expect(config.agentModels['my-custom-model']?.type).toBe('custom');
    expect(config.agentModels['my-custom-model']?.base_url).toBe('https://api.custom.com/v1');
    expect(config.agentModels['my-custom-model']?.default_model).toBe('custom-model-1');
  });

  it('nên lưu dữ liệu cấu hình xuống file json', () => {
    const mockData: LocalConfig = {
      agentModels: {
        'my-custom-model': {
          type: 'custom',
          base_url: 'https://api.custom.com/v1',
          default_model: 'custom-model-1',
        },
      },
      agentRouting: {
        Explore: 'my-custom-model',
        Plan: 'my-custom-model',
        UI: 'my-custom-model',
        default: 'my-custom-model',
      },
    };

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const loader = new ConfigLoader();
    loader.save(mockData);

    expect(writeSpy).toHaveBeenCalled();
    const args = writeSpy.mock.calls[0];
    expect(args[1]).toContain('my-custom-model');
    expect(args[1]).not.toContain('api_key');
  });

  it('nên chuyển đổi cấu hình cục bộ sang cấu hình provider hợp lệ', () => {
    const mockData: LocalConfig = {
      agentModels: {
        'custom-model-1': {
          type: 'openai',
          base_url: 'https://api.custom.com/v1',
          default_model: 'gpt-custom',
        },
      },
      agentRouting: {
        Explore: 'custom-model-1',
        Plan: 'custom-model-1',
        UI: 'custom-model-1',
        default: 'custom-model-1',
      },
    };

    const loader = new ConfigLoader();
    const providers = loader.toProviderConfigs(mockData);

    expect(providers.length).toBe(1);
    expect(providers[0]?.type).toBe('openai');
    expect(providers[0]?.baseUrl).toBe('https://api.custom.com/v1');
    expect(providers[0]?.defaultModel).toBe('gpt-custom');
  });

  it('nên tự động khôi phục cấu hình mặc định nếu file json bị hỏng định dạng', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{"invalid-json": '); 

    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    const loader = new ConfigLoader();
    const config = loader.load();

    expect(fs.readFileSync).toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled(); 
    expect(config.agentModels).toHaveProperty('openai-gpt-4o');
  });
});
