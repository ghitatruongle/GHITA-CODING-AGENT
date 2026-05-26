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
    keyPrefix: string;
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
export type AuthScope = 'chat:read' | 'chat:write' | 'models:read' | 'models:write' | 'admin:keys' | 'admin:teams' | 'admin:billing' | '*';
export interface JWTClaims {
    sub: string;
    iss: string;
    iat: number;
    exp: number;
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
export declare class APIKeyManager {
    private config;
    private keys;
    private keyHashIndex;
    constructor(config?: Partial<APIKeyConfig>);
    /** Create a new API key. Returns the raw key (show once only). */
    createKey(options: {
        name: string;
        userId: string;
        teamId?: string;
        scopes?: AuthScope[];
        rateLimitTier?: string;
        maxBudget?: number;
        expiresIn?: number;
        metadata?: Record<string, unknown>;
    }): {
        rawKey: string;
        entry: APIKeyEntry;
    };
    /** Validate a raw API key */
    validateKey(rawKey: string): AuthResult;
    /** Revoke (deactivate) a key */
    revokeKey(keyId: string): boolean;
    /** Rotate a key — deactivate old, create new with same settings */
    rotateKey(keyId: string): {
        rawKey: string;
        entry: APIKeyEntry;
    } | null;
    /** List keys for a user */
    listKeys(userId: string): APIKeyEntry[];
    /** Get key by ID (without raw key) */
    getKey(keyId: string): APIKeyEntry | undefined;
    /** Generate a JWT token for a user */
    generateToken(options: {
        userId: string;
        teamId?: string;
        scopes?: AuthScope[];
        expiresIn?: number;
        metadata?: Record<string, unknown>;
    }): string;
    /** Validate a JWT token */
    validateToken(token: string): AuthResult;
    /** Authenticate from Authorization header value */
    authenticate(authHeader: string): AuthResult;
    /** Check if auth result has required scopes */
    checkScopes(auth: AuthResult, required: AuthScope[]): boolean;
    /** Get stats */
    getStats(): {
        totalKeys: number;
        activeKeys: number;
        expiredKeys: number;
        revokedKeys: number;
    };
}
//# sourceMappingURL=auth.d.ts.map