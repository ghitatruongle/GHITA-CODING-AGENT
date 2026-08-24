// Auth0, Okta, Keycloak, Entra ID (Azure AD), WorkOS
// Reference: LiteLLM proxy_auth/, CrewAI a2a/auth/

// --- Types ---

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
  codeVerifier?: string; // PKCE
  redirectUri: string;
  createdAt: number;
}

import { createHash } from 'node:crypto';

function generateRandomString(length: number): string {
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

function generateCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url');
}

// --- SSO Provider Implementations ---

/** Base SSO Provider */
abstract class BaseSSOProvider {
  constructor(protected config: SSOConfig) {}

  abstract getAuthorizationUrl(state: SSOState): string;
  abstract exchangeCode(code: string, state: SSOState): Promise<SSOTokenResponse>;
  abstract getUserInfo(accessToken: string): Promise<SSOUserInfo>;

  protected buildUrl(base: string, params: Record<string, string>): string {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

/** Auth0 SSO */
class Auth0SSOProvider extends BaseSSOProvider {
  getAuthorizationUrl(state: SSOState): string {
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

  async exchangeCode(code: string, state: SSOState): Promise<SSOTokenResponse> {
    const body: Record<string, string> = {
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

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      idToken: data.id_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
    };
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const resp = await fetch(`${this.config.issuer}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      throw new Error(`Auth0 userinfo failed: ${resp.status}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      sub: data.sub as string,
      email: data.email as string,
      name: data.name as string,
      picture: data.picture as string,
      providerUserId: data.sub as string,
      provider: 'auth0',
    };
  }
}

/** Okta SSO */
class OktaSSOProvider extends BaseSSOProvider {
  getAuthorizationUrl(state: SSOState): string {
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

  async exchangeCode(code: string, state: SSOState): Promise<SSOTokenResponse> {
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

    if (!resp.ok) throw new Error(`Okta token exchange failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      idToken: data.id_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
    };
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const resp = await fetch(`${this.config.issuer}/v1/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) throw new Error(`Okta userinfo failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      sub: data.sub as string,
      email: data.email as string,
      name: data.name as string,
      picture: data.picture as string,
      providerUserId: data.sub as string,
      provider: 'okta',
    };
  }
}

/** Keycloak SSO */
class KeycloakSSOProvider extends BaseSSOProvider {
  private get realm(): string {
    return (this.config.extra?.realm as string) ?? 'master';
  }

  private get baseUrl(): string {
    return `${this.config.issuer}/realms/${this.realm}/protocol/openid-connect`;
  }

  getAuthorizationUrl(state: SSOState): string {
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

  async exchangeCode(code: string, state: SSOState): Promise<SSOTokenResponse> {
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

    if (!resp.ok) throw new Error(`Keycloak token exchange failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      idToken: data.id_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
    };
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const resp = await fetch(`${this.baseUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) throw new Error(`Keycloak userinfo failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      sub: data.sub as string,
      email: data.email as string,
      name: (data.name as string) ?? (data.preferred_username as string) ?? '',
      providerUserId: data.sub as string,
      provider: 'keycloak',
    };
  }
}

/** Microsoft Entra ID (Azure AD) SSO */
class EntraIDSSOProvider extends BaseSSOProvider {
  private get tenantId(): string {
    return (this.config.extra?.tenantId as string) ?? 'common';
  }

  getAuthorizationUrl(state: SSOState): string {
    return this.buildUrl(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize`,
      {
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
      },
    );
  }

  async exchangeCode(code: string, state: SSOState): Promise<SSOTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: state.redirectUri,
      scope: (this.config.scopes ?? ['openid', 'profile', 'email']).join(' '),
      ...(state.codeVerifier ? { code_verifier: state.codeVerifier } : {}),
    });

    const resp = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      },
    );

    if (!resp.ok) throw new Error(`Entra ID token exchange failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      idToken: data.id_token as string,
      refreshToken: data.refresh_token as string,
      expiresIn: data.expires_in as number,
      tokenType: data.token_type as string,
    };
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) throw new Error(`Entra ID userinfo failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      sub: data.id as string,
      email: (data.mail as string) ?? (data.userPrincipalName as string) ?? '',
      name: data.displayName as string,
      providerUserId: data.id as string,
      provider: 'entra_id',
    };
  }
}

/** WorkOS SSO */
class WorkOSSSOProvider extends BaseSSOProvider {
  getAuthorizationUrl(state: SSOState): string {
    return this.buildUrl('https://api.workos.com/sso/authorize', {
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state: state.state,
      ...(this.config.extra?.organizationId
        ? { organization_id: this.config.extra.organizationId as string }
        : {}),
      ...(this.config.extra?.connectionId
        ? { connection_id: this.config.extra.connectionId as string }
        : {}),
      ...(this.config.extra?.domain ? { domain_hint: this.config.extra.domain as string } : {}),
    });
  }

  async exchangeCode(code: string, _state: SSOState): Promise<SSOTokenResponse> {
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

    if (!resp.ok) throw new Error(`WorkOS token exchange failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      accessToken: data.access_token as string,
      idToken: data.id_token as string,
      expiresIn: 3600,
      tokenType: 'Bearer',
    };
  }

  async getUserInfo(accessToken: string): Promise<SSOUserInfo> {
    const resp = await fetch('https://api.workos.com/sso/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) throw new Error(`WorkOS userinfo failed: ${resp.status}`);

    const data = (await resp.json()) as Record<string, unknown>;
    return {
      sub: data.id as string,
      email: data.email as string,
      name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
      picture: data.profilePictureUrl as string,
      providerUserId: data.id as string,
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
  private configs: Map<SSOProvider, SSOConfig> = new Map();
  private pendingStates: Map<string, SSOState> = new Map();
  private providers: Map<SSOProvider, BaseSSOProvider> = new Map();

  /** Register an SSO provider */
  registerProvider(config: SSOConfig): void {
    this.configs.set(config.provider, config);

    const providerMap: Record<SSOProvider, new (c: SSOConfig) => BaseSSOProvider> = {
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
  getAuthorizationUrl(
    provider: SSOProvider,
    usePKCE = true,
  ): {
    url: string;
    state: string;
  } {
    const ssoProvider = this.providers.get(provider);
    if (!ssoProvider) throw new Error(`SSO provider not registered: ${provider}`);

    const stateStr = generateRandomString(32);
    const codeVerifier = usePKCE ? generateRandomString(64) : undefined;

    const ssoConfig = this.configs.get(provider);
    if (!ssoConfig) throw new Error(`SSO config not found for provider: ${provider}`);

    const state: SSOState = {
      state: stateStr,
      codeVerifier,
      redirectUri: ssoConfig.redirectUri,
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
  async handleCallback(
    provider: SSOProvider,
    code: string,
    state: string,
  ): Promise<{ user: SSOUserInfo; token: SSOTokenResponse }> {
    const pendingState = this.pendingStates.get(state);
    if (!pendingState) {
      throw new Error('Invalid or expired SSO state');
    }

    this.pendingStates.delete(state);

    const ssoProvider = this.providers.get(provider);
    if (!ssoProvider) throw new Error(`SSO provider not registered: ${provider}`);

    const token = await ssoProvider.exchangeCode(code, pendingState);
    const user = await ssoProvider.getUserInfo(token.accessToken);

    return { user, token };
  }

  /** Get list of registered providers */
  getRegisteredProviders(): SSOProvider[] {
    return [...this.configs.keys()];
  }

  /** Check if a provider is registered */
  isRegistered(provider: SSOProvider): boolean {
    return this.configs.has(provider);
  }
}
