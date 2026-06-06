// ==============================================================================
// Phase 6: OAuth Provider Registry
// ==============================================================================

export interface OAuthProviderSpec {
  type: string;
  name: string;
  authUrl: string;
  tokenUrl: string;
  defaultScopes: string[];
  usePKCE: boolean;
  clientId: string;
  redirectUri: string;
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderSpec> = {
  openai: {
    type: 'openai',
    name: 'OpenAI',
    authUrl: 'https://auth.openai.com/authorize',
    tokenUrl: 'https://auth.openai.com/token',
    defaultScopes: ['openid', 'profile', 'email'],
    usePKCE: true,
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
  },
  anthropic: {
    type: 'anthropic',
    name: 'Anthropic',
    authUrl: 'https://console.anthropic.com/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/oauth/token',
    defaultScopes: ['org:create_api_key', 'user:profile', 'user:inference'],
    usePKCE: true,
    clientId: 'ghita-coding-agent',
    redirectUri: 'http://localhost:1455/auth/callback',
  },
  google: {
    type: 'google',
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    defaultScopes: ['https://www.googleapis.com/auth/generative-language'],
    usePKCE: true,
    clientId: 'ghita-coding-agent.apps.googleusercontent.com',
    redirectUri: 'http://localhost:1455/auth/callback',
  },
};

export function getOAuthProvider(type: string): OAuthProviderSpec | undefined {
  return OAUTH_PROVIDERS[type];
}

export function listOAuthProviders(): OAuthProviderSpec[] {
  return Object.values(OAUTH_PROVIDERS);
}
