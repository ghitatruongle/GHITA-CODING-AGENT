export type SSOProvider = 'auth0' | 'okta' | 'keycloak' | 'entra_id' | 'workos' | 'custom';
export interface SSOConfig {
    provider: SSOProvider;
    clientId: string;
    clientSecret: string;
    /** Issuer URL (e.g., https://your-domain.auth0.com) */
    issuer: string;
    /** Redirect URI after login */
    redirectUri: string;
    /** Scopes to request */
    scopes?: string[];
    /** Additional provider-specific config */
    extra?: Record<string, unknown>;
}
export interface SSOTokenResponse {
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    expiresIn: number;
    tokenType: string;
}
export interface SSOUserInfo {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    /** Provider-specific user ID */
    providerUserId: string;
    provider: SSOProvider;
    teams?: string[];
    roles?: string[];
    metadata?: Record<string, unknown>;
}
export interface SSOState {
    state: string;
    codeVerifier?: string;
    redirectUri: string;
    createdAt: number;
}
export declare class SSOManager {
    private configs;
    private pendingStates;
    private providers;
    /** Register an SSO provider */
    registerProvider(config: SSOConfig): void;
    /** Get authorization URL for a provider */
    getAuthorizationUrl(provider: SSOProvider, usePKCE?: boolean): {
        url: string;
        state: string;
    };
    /** Handle callback — exchange code for token and get user info */
    handleCallback(provider: SSOProvider, code: string, state: string): Promise<{
        user: SSOUserInfo;
        token: SSOTokenResponse;
    }>;
    /** Get list of registered providers */
    getRegisteredProviders(): SSOProvider[];
    /** Check if a provider is registered */
    isRegistered(provider: SSOProvider): boolean;
}
//# sourceMappingURL=sso.d.ts.map