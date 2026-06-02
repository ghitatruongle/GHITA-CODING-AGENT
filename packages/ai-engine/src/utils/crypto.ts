// ==============================================================================
// GHITA CODING AGENT - Secure AES-256 Cryptography Helper
// ==============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Đối với AES-256-GCM, IV (nonce) có độ dài 12 bytes

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
    const authTag = cipher.getAuthTag().toString('hex');

    // Trả về IV:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Giải mã văn bản đã mã hóa AES-256-CBC
   * @param encryptedData Dữ liệu dạng "iv_hex:encrypted_hex"
   * @param secretKey Khóa bí mật
   */
  static decrypt(encryptedData: string, secretKey: string): string {
    const parts = encryptedData.split(':');
    if (parts.length === 2) {
      // Legacy format: IV:ciphertext (AES-256-CBC) — migrate on decrypt
      const ivPart = parts[0];
      const cipherPart = parts[1];
      if (!ivPart || !cipherPart) throw new Error('Invalid legacy encrypted data format.');
      const iv = Buffer.from(ivPart, 'hex');
      const encryptedText = Buffer.from(cipherPart, 'hex');
      const key = this.normalizeKey(secretKey);
      let decryptedText = '';
      try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        decryptedText = decrypted.toString('utf8');
      } catch {
        throw new Error('Khóa giải mã không chính xác hoặc dữ liệu bị hỏng.');
      }
      if (!decryptedText.startsWith('GHITA_V1:')) {
        throw new Error('Khóa giải mã không chính xác hoặc dữ liệu bị hỏng.');
      }
      return decryptedText.slice(9);
    }
    if (parts.length !== 3) {
      throw new Error('Dữ liệu mã hóa không hợp lệ. Phải chứa IV:authTag:ciphertext.');
    }

  const ivPart = parts[0];
  const authTagPart = parts[1];
  const encryptedPart = parts[2];
  if (!ivPart || !authTagPart || !encryptedPart) throw new Error('Invalid encrypted data format.');
  const iv = Buffer.from(ivPart, 'hex');
  const authTag = Buffer.from(authTagPart, 'hex');
  const encryptedText = Buffer.from(encryptedPart, 'hex');
    const key = this.normalizeKey(secretKey);

    let decryptedText = '';
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      decryptedText = decrypted.toString('utf8');
    } catch {
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
