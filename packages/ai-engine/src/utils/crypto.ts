import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; 

export class CryptoHelper {
  
  static encrypt(text: string, secretKey: string): string {
    const key = this.normalizeKey(secretKey);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const prefixedText = `GHITA_V1:${text}`;
    let encrypted = cipher.update(prefixedText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

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
    if (!ivPart || !authTagPart || !encryptedPart)
      throw new Error('Invalid encrypted data format.');
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

    return decryptedText.slice(9); 
  }

  private static normalizeKey(secretKey: string): Buffer {
    return crypto.createHash('sha256').update(secretKey).digest();
  }
}
