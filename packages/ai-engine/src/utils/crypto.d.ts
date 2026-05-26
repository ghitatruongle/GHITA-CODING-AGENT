export declare class CryptoHelper {
    /**
     * Mã hóa văn bản thô bằng AES-256-CBC
     * @param text Văn bản thô cần mã hóa
     * @param secretKey Khóa bí mật (bắt buộc phải dài 32 ký tự / 256-bit)
     */
    static encrypt(text: string, secretKey: string): string;
    /**
     * Giải mã văn bản đã mã hóa AES-256-CBC
     * @param encryptedData Dữ liệu dạng "iv_hex:encrypted_hex"
     * @param secretKey Khóa bí mật
     */
    static decrypt(encryptedData: string, secretKey: string): string;
    /**
     * Đảm bảo khóa bí mật luôn có độ dài 32 ký tự bằng cách băm SHA-256
     */
    private static normalizeKey;
}
//# sourceMappingURL=crypto.d.ts.map