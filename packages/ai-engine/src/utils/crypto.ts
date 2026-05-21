// ==============================================================================
// GHITA CODING AGENT - Secure AES-256 Cryptography Helper
// ==============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // Đối với AES-256-CBC, IV luôn có độ dài 16 bytes

export class CryptoHelper {
  /**
   * Mã hóa văn bản thô bằng AES-256-CBC
   * @param text Văn bản thô cần mã hóa
   * @param secretKey Khóa bí mật (bắt buộc phải dài 32 ký tự / 256-bit)
   */
  static encrypt(text: string, secretKey: string): string {
    const key = this.normalizeKey(secretKey);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    // Thêm prefix "GHITA_V1:" để xác thực tính toàn vẹn khi giải mã
    const prefixedText = `GHITA_V1:${text}`;
    let encrypted = cipher.update(prefixedText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Trả về IV dạng hex ghép với văn bản đã mã hóa
    return `${iv.toString('hex')}:${encrypted}`;
  }

  /**
   * Giải mã văn bản đã mã hóa AES-256-CBC
   * @param encryptedData Dữ liệu dạng "iv_hex:encrypted_hex"
   * @param secretKey Khóa bí mật
   */
  static decrypt(encryptedData: string, secretKey: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Dữ liệu mã hóa không hợp lệ. Phải chứa IV và văn bản mã hóa phân tách bởi dấu hai chấm.');
    }

    const iv = Buffer.from(parts[0]!, 'hex');
    const encryptedText = Buffer.from(parts[1]!, 'hex');
    const key = this.normalizeKey(secretKey);
    
    let decryptedText = '';
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      decryptedText = decrypted.toString('utf8');
    } catch (e) {
      throw new Error('Khóa giải mã không chính xác hoặc dữ liệu bị hỏng.');
    }

    if (!decryptedText.startsWith('GHITA_V1:')) {
      throw new Error('Khóa giải mã không chính xác hoặc dữ liệu bị hỏng.');
    }

    return decryptedText.slice(9); // Cắt bỏ "GHITA_V1:"
  }

  /**
   * Đảm bảo khóa bí mật luôn có độ dài 32 ký tự bằng cách băm SHA-256
   */
  private static normalizeKey(secretKey: string): Buffer {
    return crypto.createHash('sha256').update(secretKey).digest();
  }
}
