/**
 * App configuration - values injected at build time or from environment.
 * NEVER hardcode secrets in source code.
 */
export const CLOUD_DISCOVERY_API_KEY = process.env.GHITA_CLOUD_API_KEY || '';

export const CLOUD_DISCOVERY_API_URL = 'https://keyvalue.immanuel.co/api/KeyVal/GetValue';

/**
 * Tạm thời vô hiệu hóa Cloud Discovery cho đến khi API key/cloud backend
 * được cấu hình chính thức. Khi bật lại, đặt thành `true`.
 */
export const ENABLE_CLOUD_DISCOVERY = false;
