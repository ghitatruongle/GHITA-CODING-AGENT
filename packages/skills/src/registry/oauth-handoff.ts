import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { SaaSConnection, SaaSAppDefinition } from './composioAdapter.js';
import { SAAS_APPS } from './composioAdapter.js';

// Helper to generate base64url representation from a Buffer
function base64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export interface OAuthSession {
  appId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: number;
}

/**
 * Handles generating OAuth state, PKCE verifiers/challenges, and validating callbacks.
 */
export class OAuthHandoffManager {
  private sessions = new Map<string, OAuthSession>();
  public sessionTimeoutMs = 10 * 60 * 1000; // 10 minutes default

  /**
   * Generates authorization URL, state random string, and PKCE verifier/challenge.
   */
  public generateSession(appId: string, redirectUri: string, scope?: string): {
    url: string;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
  } {
    const state = crypto.randomBytes(16).toString('hex');
    const verifier = base64url(crypto.randomBytes(32));
    
    // S256 Challenge method
    const hash = crypto.createHash('sha256').update(verifier).digest();
    const challenge = base64url(hash);

    const session: OAuthSession = {
      appId,
      redirectUri,
      state,
      codeVerifier: verifier,
      codeChallenge: challenge,
      createdAt: Date.now(),
    };

    this.sessions.set(state, session);

    const url = `https://auth.ghita.ai/oauth/authorize?response_type=code&client_id=ghita_client&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256&scope=${encodeURIComponent(
      scope || ''
    )}`;

    return {
      url,
      state,
      codeVerifier: verifier,
      codeChallenge: challenge,
    };
  }

  /**
   * Validates state, verifier, and generates simulated SaaS Connection tokens.
   */
  public async handleCallback(state: string, _code: string, incomingVerifier?: string): Promise<SaaSConnection> {
    const session = this.sessions.get(state);
    if (!session) {
      throw new Error('OAuth session not found');
    }

    if (Date.now() - session.createdAt > this.sessionTimeoutMs) {
      this.sessions.delete(state);
      throw new Error('OAuth session expired');
    }

    if (incomingVerifier) {
      const hash = crypto.createHash('sha256').update(incomingVerifier).digest();
      const computedChallenge = base64url(hash);
      if (computedChallenge !== session.codeChallenge) {
        throw new Error('PKCE verification failed');
      }
    }

    // Clean up used session
    this.sessions.delete(state);

    return {
      appId: session.appId,
      accountId: 'default',
      accountLabel: `${session.appId} Account`,
      accessToken: `mock_access_${crypto.randomBytes(8).toString('hex')}`,
      refreshToken: `mock_refresh_${crypto.randomBytes(8).toString('hex')}`,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour expiry
    };
  }

  /**
   * Directly registers/sets a session for testing purposes.
   */
  public setSession(state: string, session: OAuthSession): void {
    this.sessions.set(state, session);
  }
}

/**
 * Securely stores credentials using AES-256-GCM.
 */
export class KeychainStore {
  private cache = new Map<string, SaaSConnection>();

  constructor(
    public readonly storagePath?: string,
    private readonly masterPassword = 'ghita-default-secure-password'
  ) {}

  private encrypt(data: string): string {
    const iv = crypto.randomBytes(12);
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.masterPassword, salt, 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid ciphertext format');
    }
    const [saltHex, ivHex, authTagHex, encryptedHex] = parts as [string, string, string, string];
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const key = crypto.scryptSync(this.masterPassword, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted: string = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private async save(): Promise<void> {
    if (!this.storagePath) return;
    const dataStr = JSON.stringify(Array.from(this.cache.entries()));
    const encrypted = this.encrypt(dataStr);
    await fs.promises.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.promises.writeFile(this.storagePath, encrypted, 'utf8');
  }

  private async load(): Promise<void> {
    if (!this.storagePath) return;
    if (!fs.existsSync(this.storagePath)) {
      this.cache.clear();
      return;
    }
    try {
      const encrypted = await fs.promises.readFile(this.storagePath, 'utf8');
      const decrypted = this.decrypt(encrypted);
      const entries = JSON.parse(decrypted) as [string, SaaSConnection][];
      this.cache = new Map(entries);
    } catch {
      this.cache.clear();
    }
  }

  public async setCredential(conn: SaaSConnection): Promise<void> {
    await this.load();
    const key = `${conn.appId.toLowerCase()}:${conn.accountId || 'default'}`;
    this.cache.set(key, conn);
    await this.save();
  }

  public async getCredential(appId: string, accountId?: string): Promise<SaaSConnection | undefined> {
    await this.load();
    const key = `${appId.toLowerCase()}:${accountId || 'default'}`;
    return this.cache.get(key);
  }

  public async removeCredential(appId: string, accountId?: string): Promise<boolean> {
    await this.load();
    const key = `${appId.toLowerCase()}:${accountId || 'default'}`;
    const deleted = this.cache.delete(key);
    if (deleted) {
      await this.save();
    }
    return deleted;
  }

  public async listConnectedApps(): Promise<string[]> {
    await this.load();
    const apps = new Set<string>();
    for (const key of this.cache.keys()) {
      const appId = key.split(':')[0];
      if (appId) {
        apps.add(appId);
      }
    }
    return Array.from(apps);
  }
}

/**
 * Access control permission gates for SaaS integrations.
 */
export class PermissionGateManager {
  public allowedProviders = new Set<string>();
  public deniedProviders = new Set<string>();
  public allowedActions = new Set<string>();
  public deniedActions = new Set<string>();

  private dialogHandler: (appId: string, action?: string) => Promise<boolean> = async () => true;

  /**
   * Sets the dialog callback that displays the confirmation prompt to the user.
   */
  public setDialogHandler(handler: (appId: string, action?: string) => Promise<boolean>): void {
    this.dialogHandler = handler;
  }

  /**
   * Grants a permission policy.
   */
  public grantPermission(appId: string, action?: string): void {
    const appKey = appId.toLowerCase();
    if (action) {
      this.allowedActions.add(`${appKey}:${action.toLowerCase()}`);
      this.deniedActions.delete(`${appKey}:${action.toLowerCase()}`);
    } else {
      this.allowedProviders.add(appKey);
      this.deniedProviders.delete(appKey);
    }
  }

  /**
   * Revokes a permission policy.
   */
  public revokePermission(appId: string, action?: string): void {
    const appKey = appId.toLowerCase();
    if (action) {
      this.allowedActions.delete(`${appKey}:${action.toLowerCase()}`);
      this.deniedActions.delete(`${appKey}:${action.toLowerCase()}`);
    } else {
      this.allowedProviders.delete(appKey);
      this.deniedProviders.delete(appKey);
    }
  }

  /**
   * Checks if permission is granted, otherwise prompts the user via dialog.
   */
  public async checkPermission(appId: string, action?: string): Promise<boolean> {
    const appKey = appId.toLowerCase();
    const actionKey = action ? `${appKey}:${action.toLowerCase()}` : undefined;

    if (this.deniedProviders.has(appKey)) return false;
    if (actionKey && this.deniedActions.has(actionKey)) return false;

    if (actionKey && this.allowedActions.has(actionKey)) return true;
    if (this.allowedProviders.has(appKey)) return true;

    // Trigger confirmation dialog fallback
    const approved = await this.dialogHandler(appId, action);
    if (approved) {
      if (actionKey) {
        this.allowedActions.add(actionKey);
      } else {
        this.allowedProviders.add(appKey);
      }
    } else {
      if (actionKey) {
        this.deniedActions.add(actionKey);
      } else {
        this.deniedProviders.add(appKey);
      }
    }

    return approved;
  }
}

/**
 * Resolves a toolkitSlug (e.g. "composio/slack", "slack_toolkit") to its SaaSAppDefinition.
 */
export function discoverToolkitSlug(toolkitSlug: string): SaaSAppDefinition | undefined {
  const slug = toolkitSlug.toLowerCase().trim();
  const clean = slug.replace(/(composio\/|toolkit-|-toolkit|_toolkit|tool-|-integration|_integration)/g, '');
  
  let match = SAAS_APPS.find((app) => app.id === clean);
  if (!match) {
    match = SAAS_APPS.find((app) => app.id.includes(clean) || clean.includes(app.id));
  }
  return match;
}
