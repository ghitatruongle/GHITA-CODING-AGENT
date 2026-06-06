// ==============================================================================
// GHITA CODING AGENT - Phase 3.1: API Key Authentication
// API keys, JWT tokens, custom auth, proxy auth layer
// Reference: LiteLLM proxy_auth/
// ==============================================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// --- Types ---

export type AuthMethod = 'api_key' | 'jwt' | 'custom';

export interface APIKeyConfig {
  /** Hashed key storage (never store raw keys) */
  hashedKeys: Map<string, APIKeyEntry>;
  /** JWT secret for token signing */
  jwtSecret: string;
  /** Token expiry in seconds (default: 24h) */
  tokenExpirySeconds?: number;
  /** Enable key rotation */
  enableRotation?: boolean;
}

export interface APIKeyEntry {
  keyId: string;
  keyHash: string;
  keyPrefix: string; // First 8 chars for identification
  name: string;
  userId: string;
  teamId?: string;
  scopes: AuthScope[];
  rateLimitTier?: string;
  maxBudget?: number;
  expiresAt?: Date;
  createdAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

export type AuthScope =
  | 'chat:read'
  | 'chat:write'
  | 'models:read'
  | 'models:write'
  | 'admin:keys'
  | 'admin:teams'
  | 'admin:billing'
  | '*';

export interface JWTClaims {
  sub: string; // user ID
  iss: string; // issuer
  iat: number; // issued at
  exp: number; // expiry
  scope?: AuthScope[];
  teamId?: string;
  metadata?: Record<string, unknown>;
}

export interface AuthResult {
  authenticated: boolean;
  userId?: string;
  teamId?: string;
  scopes?: AuthScope[];
  method?: AuthMethod;
  keyId?: string;
  error?: string;
}

export interface AuthMiddlewareOptions {
  /** Required scopes for this operation */
  requiredScopes?: AuthScope[];
  /** Allow anonymous access */
  allowAnonymous?: boolean;
}

// --- Helpers ---

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

function generateKeyId(): string {
  return `ghita_${randomBytes(16).toString('hex')}`;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

// --- JWT Implementation (HMAC-SHA256) ---

function signJWT(claims: JWTClaims, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signature = createHash('sha256')
    .update(`${header}.${payload}.${secret}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function verifyJWT(token: string, secret: string): JWTClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) return null;

    const expectedSig = createHash('sha256')
      .update(`${header}.${payload}.${secret}`)
      .digest('base64url');

    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const claims: JWTClaims = JSON.parse(base64UrlDecode(payload));

    // Check expiry
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

// --- APIKeyManager ---

export class APIKeyManager {
  private config: APIKeyConfig;
  private keys: Map<string, APIKeyEntry>;
  private keyHashIndex: Map<string, string>; // hash -> keyId

  constructor(config: Partial<APIKeyConfig> = {}) {
    this.config = {
      hashedKeys: new Map(),
      jwtSecret: config.jwtSecret || randomBytes(32).toString('hex'),
      tokenExpirySeconds: config.tokenExpirySeconds ?? 86400,
      enableRotation: config.enableRotation ?? false,
      ...config,
    };
    this.keys = this.config.hashedKeys;
    this.keyHashIndex = new Map();

    // Build hash index
    for (const [keyId, entry] of this.keys) {
      this.keyHashIndex.set(entry.keyHash, keyId);
    }
  }

  // --- API Key Operations ---

  /** Create a new API key. Returns the raw key (show once only). */
  createKey(options: {
    name: string;
    userId: string;
    teamId?: string;
    scopes?: AuthScope[];
    rateLimitTier?: string;
    maxBudget?: number;
    expiresIn?: number; // seconds
    metadata?: Record<string, unknown>;
  }): { rawKey: string; entry: APIKeyEntry } {
    const rawKey = `ghita_${randomBytes(32).toString('hex')}`;
    const keyId = generateKeyId();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12);

    const entry: APIKeyEntry = {
      keyId,
      keyHash,
      keyPrefix,
      name: options.name,
      userId: options.userId,
      teamId: options.teamId,
      scopes: options.scopes ?? ['chat:read', 'chat:write'],
      rateLimitTier: options.rateLimitTier,
      maxBudget: options.maxBudget,
      expiresAt: options.expiresIn ? new Date(Date.now() + options.expiresIn * 1000) : undefined,
      createdAt: new Date(),
      isActive: true,
      metadata: options.metadata,
    };

    this.keys.set(keyId, entry);
    this.keyHashIndex.set(keyHash, keyId);

    return { rawKey, entry };
  }

  /** Validate a raw API key */
  validateKey(rawKey: string): AuthResult {
    const keyHash = hashKey(rawKey);
    const keyId = this.keyHashIndex.get(keyHash);

    if (!keyId) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    const entry = this.keys.get(keyId);
    if (!entry) {
      return { authenticated: false, error: 'Key not found' };
    }

    if (!entry.isActive) {
      return { authenticated: false, error: 'API key is deactivated' };
    }

    if (entry.expiresAt && entry.expiresAt < new Date()) {
      return { authenticated: false, error: 'API key has expired' };
    }

    // Update last used
    entry.lastUsedAt = new Date();

    return {
      authenticated: true,
      userId: entry.userId,
      teamId: entry.teamId,
      scopes: entry.scopes,
      method: 'api_key',
      keyId: entry.keyId,
    };
  }

  /** Revoke (deactivate) a key */
  revokeKey(keyId: string): boolean {
    const entry = this.keys.get(keyId);
    if (!entry) return false;
    entry.isActive = false;
    return true;
  }

  /** Rotate a key — deactivate old, create new with same settings */
  rotateKey(keyId: string): { rawKey: string; entry: APIKeyEntry } | null {
    const oldEntry = this.keys.get(keyId);
    if (!oldEntry) return null;

    oldEntry.isActive = false;

    return this.createKey({
      name: oldEntry.name,
      userId: oldEntry.userId,
      teamId: oldEntry.teamId,
      scopes: oldEntry.scopes,
      rateLimitTier: oldEntry.rateLimitTier,
      maxBudget: oldEntry.maxBudget,
      metadata: oldEntry.metadata,
    });
  }

  /** List keys for a user */
  listKeys(userId: string): APIKeyEntry[] {
    return [...this.keys.values()].filter((k) => k.userId === userId);
  }

  /** Get key by ID (without raw key) */
  getKey(keyId: string): APIKeyEntry | undefined {
    return this.keys.get(keyId);
  }

  // --- JWT Operations ---

  /** Generate a JWT token for a user */
  generateToken(options: {
    userId: string;
    teamId?: string;
    scopes?: AuthScope[];
    expiresIn?: number;
    metadata?: Record<string, unknown>;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const expiry = options.expiresIn ?? this.config.tokenExpirySeconds ?? 0;
    if (!expiry) return '';

    const claims: JWTClaims = {
      sub: options.userId,
      iss: 'ghita-coding-agent',
      iat: now,
      exp: now + expiry,
      scope: options.scopes,
      teamId: options.teamId,
      metadata: options.metadata,
    };

    return signJWT(claims, this.config.jwtSecret);
  }

  /** Validate a JWT token */
  validateToken(token: string): AuthResult {
    const claims = verifyJWT(token, this.config.jwtSecret);

    if (!claims) {
      return { authenticated: false, error: 'Invalid or expired JWT token' };
    }

    return {
      authenticated: true,
      userId: claims.sub,
      teamId: claims.teamId,
      scopes: claims.scope,
      method: 'jwt',
    };
  }

  // --- Unified Auth ---

  /** Authenticate from Authorization header value */
  authenticate(authHeader: string): AuthResult {
    if (!authHeader) {
      return { authenticated: false, error: 'No authorization header' };
    }

    const parts = authHeader.split(' ', 2);
    const scheme = parts[0];
    const value = parts[1] ?? '';

    if (!scheme) {
      return { authenticated: false, error: 'Invalid authorization header' };
    }

    if (scheme.toLowerCase() === 'bearer') {
      // Try API key first (ghita_ prefix)
      if (value.startsWith('ghita_')) {
        return this.validateKey(value);
      }
      // Try JWT
      return this.validateToken(value);
    }

    if (scheme.toLowerCase() === 'apikey') {
      return this.validateKey(value);
    }

    return { authenticated: false, error: 'Unsupported auth scheme' };
  }

  /** Check if auth result has required scopes */
  checkScopes(auth: AuthResult, required: AuthScope[]): boolean {
    if (!auth.authenticated || !auth.scopes) return false;
    if (auth.scopes.includes('*')) return true;
    return required.every((s) => auth.scopes?.includes(s));
  }

  /** Get stats */
  getStats(): {
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    revokedKeys: number;
  } {
    const now = new Date();
    let active = 0;
    let expired = 0;
    let revoked = 0;

    for (const entry of this.keys.values()) {
      if (!entry.isActive) {
        revoked++;
      } else if (entry.expiresAt && entry.expiresAt < now) {
        expired++;
      } else {
        active++;
      }
    }

    return {
      totalKeys: this.keys.size,
      activeKeys: active,
      expiredKeys: expired,
      revokedKeys: revoked,
    };
  }
}
