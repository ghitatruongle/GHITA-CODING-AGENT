import { describe, it, expect } from 'vitest';
import { CryptoHelper } from '../../packages/ai-engine/src/utils/crypto.js';

describe('CryptoHelper (AES-256-CBC Cryptography Helper)', () => {
  const SECRET_KEY = 'ghita-super-secret-developer-key';
  const RAW_API_KEY = 'MOCK_OPENAI_KEY_FOR_TEST_12345';

  it('nên mã hóa và giải mã chính xác 100% với cùng khóa bí mật', () => {
    const encrypted = CryptoHelper.encrypt(RAW_API_KEY, SECRET_KEY);
    expect(encrypted).toContain(':');

    const decrypted = CryptoHelper.decrypt(encrypted, SECRET_KEY);
    expect(decrypted).toBe(RAW_API_KEY);
  });

  it('nên tạo ra các bản mã khác nhau cho cùng một văn bản do IV ngẫu nhiên', () => {
    const enc1 = CryptoHelper.encrypt(RAW_API_KEY, SECRET_KEY);
    const enc2 = CryptoHelper.encrypt(RAW_API_KEY, SECRET_KEY);

    expect(enc1).not.toBe(enc2);

    expect(CryptoHelper.decrypt(enc1, SECRET_KEY)).toBe(RAW_API_KEY);
    expect(CryptoHelper.decrypt(enc2, SECRET_KEY)).toBe(RAW_API_KEY);
  });

  it('nên ném ra lỗi nếu định dạng dữ liệu mã hóa bị sai', () => {
    expect(() => {
      CryptoHelper.decrypt('invalid_format_no_colon', SECRET_KEY);
    }).toThrow('Dữ liệu mã hóa không hợp lệ');
  });

  it('nên ném ra lỗi (hoặc lỗi padding) nếu giải mã bằng sai khóa bí mật', () => {
    const encrypted = CryptoHelper.encrypt(RAW_API_KEY, SECRET_KEY);
    const wrongKey = 'wrong-secret-key-123';

    expect(() => {
      CryptoHelper.decrypt(encrypted, wrongKey);
    }).toThrow();
  });

  it('nên tự động normalize khóa có độ dài bất kỳ thông qua SHA-256', () => {
    const shortKey = 'abc';
    const encrypted = CryptoHelper.encrypt(RAW_API_KEY, shortKey);
    const decrypted = CryptoHelper.decrypt(encrypted, shortKey);
    expect(decrypted).toBe(RAW_API_KEY);
  });
});
