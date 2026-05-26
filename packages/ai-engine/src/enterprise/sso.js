// ==============================================================================
// GHITA CODING AGENT - Phase 3.3: SSO Integration
// Auth0, Okta, Keycloak, Entra ID (Azure AD), WorkOS
// Reference: LiteLLM proxy_auth/, CrewAI a2a/auth/
// ==============================================================================
// --- PKCE Helpers ---
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const bytes = new Uint8Array(length);
    // Use crypto if available, fallback to Math.random
    if (typeof globalThis.crypto !== 'undefined') {
        globalThis.crypto.getRandomValues(bytes);
    }
    for (let i = 0; i < length; i++) {
        result += chars[(bytes[i] ?? 0) % chars.length];
    }
    return result;
}
function generateCodeChallenge(codeVerifier) {
    // SHA-256 hash, base64url encoded
    const { createHash } = require('node:crypto');
    return createHash('sha256').update(codeVerifier).digest('base64url');
}
// --- SSO Provider Implementations ---
/** Base SSO Provider */
class BaseSSOProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    buildUrl(base, params) {
        const url = new URL(base);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        return url.toString();
    }
}
/** Auth0 SSO */
class Auth0SSOProvider extends BaseSSOProvider {
    getAuthorizationUrl(state) {
        return this.buildUrl(`${this.config.issuer}/authorize`, {
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
            state: state.state,
            ...(state.codeVerifier
                ? {
                    code_challenge: generateCodeChallenge(state.codeVerifier),
                    code_challenge_method: 'S256',
                }
                : {}),
        });
    }
    async exchangeCode(code, state) {
        const body = {
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: state.redirectUri,
        };
        if (state.codeVerifier) {
            body.code_verifier = state.codeVerifier;
        }
        const resp = await fetch(`${this.config.issuer}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            throw new Error(`Auth0 token exchange failed: ${resp.status}`);
        }
        const data = (await resp.json());
        return {
            accessToken: data.access_token,
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }
    async getUserInfo(accessToken) {
        const resp = await fetch(`${this.config.issuer}/userinfo`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) {
            throw new Error(`Auth0 userinfo failed: ${resp.status}`);
        }
        const data = (await resp.json());
        return {
            sub: data.sub,
            email: data.email,
            name: data.name,
            picture: data.picture,
            providerUserId: data.sub,
            provider: 'auth0',
        };
    }
}
/** Okta SSO */
class OktaSSOProvider extends BaseSSOProvider {
    getAuthorizationUrl(state) {
        return this.buildUrl(`${this.config.issuer}/v1/authorize`, {
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
            state: state.state,
            ...(state.codeVerifier
                ? {
                    code_challenge: generateCodeChallenge(state.codeVerifier),
                    code_challenge_method: 'S256',
                }
                : {}),
        });
    }
    async exchangeCode(code, state) {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: state.redirectUri,
            ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
        });
        const resp = await fetch(`${this.config.issuer}/v1/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!resp.ok)
            throw new Error(`Okta token exchange failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            accessToken: data.access_token,
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }
    async getUserInfo(accessToken) {
        const resp = await fetch(`${this.config.issuer}/v1/userinfo`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok)
            throw new Error(`Okta userinfo failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            sub: data.sub,
            email: data.email,
            name: data.name,
            picture: data.picture,
            providerUserId: data.sub,
            provider: 'okta',
        };
    }
}
/** Keycloak SSO */
class KeycloakSSOProvider extends BaseSSOProvider {
    get realm() {
        return this.config.extra?.realm ?? 'master';
    }
    get baseUrl() {
        return `${this.config.issuer}/realms/${this.realm}/protocol/openid-connect`;
    }
    getAuthorizationUrl(state) {
        return this.buildUrl(`${this.baseUrl}/auth`, {
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
            state: state.state,
            ...(state.codeVerifier
                ? {
                    code_challenge: generateCodeChallenge(state.codeVerifier),
                    code_challenge_method: 'S256',
                }
                : {}),
        });
    }
    async exchangeCode(code, state) {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: state.redirectUri,
            ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
        });
        const resp = await fetch(`${this.baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!resp.ok)
            throw new Error(`Keycloak token exchange failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            accessToken: data.access_token,
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }
    async getUserInfo(accessToken) {
        const resp = await fetch(`${this.baseUrl}/userinfo`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok)
            throw new Error(`Keycloak userinfo failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            sub: data.sub,
            email: data.email,
            name: data.name ?? data.preferred_username ?? '',
            providerUserId: data.sub,
            provider: 'keycloak',
        };
    }
}
/** Microsoft Entra ID (Azure AD) SSO */
class EntraIDSSOProvider extends BaseSSOProvider {
    get tenantId() {
        return this.config.extra?.tenantId ?? 'common';
    }
    getAuthorizationUrl(state) {
        return this.buildUrl(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`, {
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
            state: state.state,
            response_mode: 'query',
            ...(state.codeVerifier
                ? {
                    code_challenge: generateCodeChallenge(state.codeVerifier),
                    code_challenge_method: 'S256',
                }
                : {}),
        });
    }
    async exchangeCode(code, state) {
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            code,
            redirect_uri: state.redirectUri,
            scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
            ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
        });
        const resp = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!resp.ok)
            throw new Error(`Entra ID token exchange failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            accessToken: data.access_token,
            idToken: data.id_token,
            refreshToken: data.refresh_token,
            expiresIn: data.expires_in,
            tokenType: data.token_type,
        };
    }
    async getUserInfo(accessToken) {
        const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok)
            throw new Error(`Entra ID userinfo failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            sub: data.id,
            email: data.mail ?? data.userPrincipalName ?? '',
            name: data.displayName,
            providerUserId: data.id,
            provider: 'entra_id',
        };
    }
}
/** WorkOS SSO */
class WorkOSSSOProvider extends BaseSSOProvider {
    getAuthorizationUrl(state) {
        return this.buildUrl('https://api.workos.com/sso/authorize', {
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            state: state.state,
            ...(this.config.extra?.organizationId
                ? { organization_id: this.config.extra.organizationId }
                : {}),
            ...(this.config.extra?.connectionId
                ? { connection_id: this.config.extra.connectionId }
                : {}),
            ...(this.config.extra?.domain
                ? { domain_hint: this.config.extra.domain }
                : {}),
        });
    }
    async exchangeCode(code, _state) {
        const resp = await fetch('https://api.workos.com/sso/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
            }),
        });
        if (!resp.ok)
            throw new Error(`WorkOS token exchange failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            accessToken: data.access_token,
            idToken: data.id_token,
            expiresIn: 3600,
            tokenType: 'Bearer',
        };
    }
    async getUserInfo(accessToken) {
        const resp = await fetch('https://api.workos.com/sso/profile', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok)
            throw new Error(`WorkOS userinfo failed: ${resp.status}`);
        const data = (await resp.json());
        return {
            sub: data.id,
            email: data.email,
            name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
            picture: data.profilePictureUrl,
            providerUserId: data.id,
            provider: 'workos',
            metadata: {
                organizationId: data.organizationId,
                connectionId: data.connectionId,
            },
        };
    }
}
// --- SSO Manager ---
export class SSOManager {
    configs = new Map();
    pendingStates = new Map();
    providers = new Map();
    /** Register an SSO provider */
    registerProvider(config) {
        this.configs.set(config.provider, config);
        const providerMap = {
            auth0: Auth0SSOProvider,
            okta: OktaSSOProvider,
            keycloak: KeycloakSSOProvider,
            entra_id: EntraIDSSOProvider,
            workos: WorkOSSSOProvider,
            custom: Auth0SSOProvider, // Fallback to Auth0-compatible
        };
        const ProviderClass = providerMap[config.provider];
        this.providers.set(config.provider, new ProviderClass(config));
    }
    /** Get authorization URL for a provider */
    getAuthorizationUrl(provider, usePKCE = true) {
        const ssoProvider = this.providers.get(provider);
        if (!ssoProvider)
            throw new Error(`SSO provider not registered: ${provider}`);
        const stateStr = generateRandomString(32);
        const codeVerifier = usePKCE ? generateRandomString(64) : undefined;
        const state = {
            state: stateStr,
            codeVerifier,
            redirectUri: this.configs.get(provider).redirectUri,
            createdAt: Date.now(),
        };
        this.pendingStates.set(stateStr, state);
        // Clean up old states (older than 10 minutes)
        for (const [key, s] of this.pendingStates) {
            if (Date.now() - s.createdAt > 600_000) {
                this.pendingStates.delete(key);
            }
        }
        return {
            url: ssoProvider.getAuthorizationUrl(state),
            state: stateStr,
        };
    }
    /** Handle callback — exchange code for token and get user info */
    async handleCallback(provider, code, state) {
        const pendingState = this.pendingStates.get(state);
        if (!pendingState) {
            throw new Error('Invalid or expired SSO state');
        }
        this.pendingStates.delete(state);
        const ssoProvider = this.providers.get(provider);
        if (!ssoProvider)
            throw new Error(`SSO provider not registered: ${provider}`);
        const token = await ssoProvider.exchangeCode(code, pendingState);
        const user = await ssoProvider.getUserInfo(token.accessToken);
        return { user, token };
    }
    /** Get list of registered providers */
    getRegisteredProviders() {
        return [...this.configs.keys()];
    }
    /** Check if a provider is registered */
    isRegistered(provider) {
        return this.configs.has(provider);
    }
}
//# sourceMappingURL=sso.js.map