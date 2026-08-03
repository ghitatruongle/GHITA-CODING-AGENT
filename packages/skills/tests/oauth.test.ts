import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  OAuthHandoffManager,
  KeychainStore,
  PermissionGateManager,
  discoverToolkitSlug,
} from '../src/index.js';

describe('Phase 25 OAuth Handoff + toolkitSlug Discovery', () => {
  // ==============================================================================
  // 1. OAuth Handoff & PKCE Tests
  // ==============================================================================
  describe('OAuthHandoffManager', () => {
    let oauth: OAuthHandoffManager;

    beforeEach(() => {
      oauth = new OAuthHandoffManager();
    });

    it('should generate a valid authorization session', () => {
      const appId = 'github';
      const redirectUri = 'http://localhost:3000/callback';
      const scope = 'repo user';

      const session = oauth.generateSession(appId, redirectUri, scope);

      expect(session.state).toHaveLength(32); // 16 bytes hex = 32 chars
      expect(session.codeVerifier).toBeDefined();
      expect(session.codeChallenge).toBeDefined();

      // Check auth URL structure
      const url = new URL(session.url);
      expect(url.origin).toBe('https://auth.ghita.ai');
      expect(url.pathname).toBe('/oauth/authorize');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('ghita_client');
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(url.searchParams.get('state')).toBe(session.state);
      expect(url.searchParams.get('code_challenge')).toBe(session.codeChallenge);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('scope')).toBe(scope);
    });

    it('should reject callback completion when PKCE matches but no real exchange exists', async () => {
      // v0.8.0: the handoff manager validates the session but must NOT mint
      // fake "mock_access_…" tokens. Handing back fabricated tokens would make
      // an unconnected account look valid, so completion throws a clear error.
      const appId = 'slack';
      const redirectUri = 'http://localhost:3000/callback';
      const session = oauth.generateSession(appId, redirectUri);

      await expect(
        oauth.handleCallback(session.state, 'test_auth_code', session.codeVerifier),
      ).rejects.toThrow(/no real token exchange/);
      expect(oauth.sessionTimeoutMs).toBeGreaterThan(0);
    });

    it('should fail callback if state is not found', async () => {
      await expect(oauth.handleCallback('invalid_state', 'code')).rejects.toThrow(
        'OAuth session not found',
      );
    });

    it('should fail callback if PKCE verification fails', async () => {
      const session = oauth.generateSession('slack', 'http://localhost/cb');
      await expect(oauth.handleCallback(session.state, 'code', 'wrong_verifier')).rejects.toThrow(
        'PKCE verification failed',
      );
    });

    it('should fail callback if OAuth session has expired', async () => {
      const session = oauth.generateSession('slack', 'http://localhost/cb');

      // Artificially change the creation time to 15 minutes ago
      oauth.sessionTimeoutMs = 10 * 60 * 1000;
      const oldSession = {
        ...session,
        appId: 'slack',
        redirectUri: 'http://localhost/cb',
        createdAt: Date.now() - 15 * 60 * 1000,
      };

      oauth.setSession(session.state, oldSession);

      await expect(
        oauth.handleCallback(session.state, 'code', session.codeVerifier),
      ).rejects.toThrow('OAuth session expired');
    });

    it('should prevent replay by deleting session on first call', async () => {
      const session = oauth.generateSession('slack', 'http://localhost/cb');
      // The callback validates the session, deletes it, then (v0.8.0) rejects
      // because no real token exchange is configured. The important invariant is
      // that the one-time session is consumed so the SAME state cannot be used
      // twice.
      await expect(
        oauth.handleCallback(session.state, 'code', session.codeVerifier),
      ).rejects.toThrow(/no real token exchange/);

      // Second attempt with the same state should fail (session already deleted)
      await expect(
        oauth.handleCallback(session.state, 'code', session.codeVerifier),
      ).rejects.toThrow('OAuth session not found');
    });
  });

  // ==============================================================================
  // 2. Keychain Store Tests (AES-256-GCM + file fallback)
  // ==============================================================================
  describe('KeychainStore', () => {
    const testFilePath = path.join(__dirname, `test-keychain-${Date.now()}.enc`);
    let originalEnvPassword: string | undefined;

    beforeEach(() => {
      originalEnvPassword = process.env.GHITA_KEYCHAIN_PASSWORD;
      process.env.GHITA_KEYCHAIN_PASSWORD = 'super-secret-dummy-keychain-password-16';
    });

    afterEach(() => {
      if (originalEnvPassword === undefined) {
        delete process.env.GHITA_KEYCHAIN_PASSWORD;
      } else {
        process.env.GHITA_KEYCHAIN_PASSWORD = originalEnvPassword;
      }
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    });

    it('should set and retrieve credentials securely in memory (no file)', async () => {
      const store = new KeychainStore(); // no path
      const conn = {
        appId: 'github',
        accountId: 'acct1',
        accessToken: 'secret_token_abc',
        refreshToken: 'refresh_xyz',
        expiresAt: 2000000000000,
      };

      await store.setCredential(conn);
      const retrieved = await store.getCredential('github', 'acct1');
      expect(retrieved).toEqual(conn);
    });

    it('should encrypt and save credentials to file, and decrypt them back', async () => {
      const store1 = new KeychainStore(testFilePath, 'my-super-secret-password');
      const conn = {
        appId: 'jira',
        accountId: 'work',
        accessToken: 'jira_secret_token_123',
        expiresAt: 1800000000000,
      };

      await store1.setCredential(conn);
      expect(fs.existsSync(testFilePath)).toBe(true);

      // Verify file contents are indeed encrypted/non-plaintext
      const rawFile = fs.readFileSync(testFilePath, 'utf8');
      expect(rawFile).not.toContain('jira_secret_token_123'); // Should be cipher text
      expect(rawFile.split(':')).toHaveLength(4); // salt:iv:authTag:encrypted

      // Load with another instance using the same password
      const store2 = new KeychainStore(testFilePath, 'my-super-secret-password');
      const retrieved = await store2.getCredential('jira', 'work');
      expect(retrieved).toEqual(conn);
    });

    it('should list connected apps and remove credentials correctly', async () => {
      const store = new KeychainStore(testFilePath);
      const conn1 = { appId: 'slack', accessToken: 'slack_tok' };
      const conn2 = { appId: 'github', accessToken: 'github_tok' };

      await store.setCredential(conn1);
      await store.setCredential(conn2);

      const apps = await store.listConnectedApps();
      expect(apps).toContain('slack');
      expect(apps).toContain('github');

      const deleted = await store.removeCredential('slack');
      expect(deleted).toBe(true);

      const appsAfter = await store.listConnectedApps();
      expect(appsAfter).not.toContain('slack');
      expect(appsAfter).toContain('github');

      const retrievedSlack = await store.getCredential('slack');
      expect(retrievedSlack).toBeUndefined();
    });
  });

  // ==============================================================================
  // 3. Permission Gate Manager & Dialog Prompt tests
  // ==============================================================================
  describe('PermissionGateManager', () => {
    let gate: PermissionGateManager;

    beforeEach(() => {
      gate = new PermissionGateManager();
    });

    it('should default to prompting the user via dialogHandler', async () => {
      const dialogMock = vi.fn().mockResolvedValue(true);
      gate.setDialogHandler(dialogMock);

      const allowed = await gate.checkPermission('github', 'create_issue');
      expect(allowed).toBe(true);
      expect(dialogMock).toHaveBeenCalledWith('github', 'create_issue');
    });

    it('should cache and respect granted provider permissions', async () => {
      const dialogMock = vi.fn().mockResolvedValue(true);
      gate.setDialogHandler(dialogMock);

      gate.grantPermission('github'); // Grant whole provider

      const allowed1 = await gate.checkPermission('github', 'create_issue');
      const allowed2 = await gate.checkPermission('github', 'list_repos');

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true);
      expect(dialogMock).not.toHaveBeenCalled(); // Cached, no dialog prompt needed
    });

    it('should respect granted action-specific permissions', async () => {
      const dialogMock = vi.fn().mockResolvedValue(false);
      gate.setDialogHandler(dialogMock);

      gate.grantPermission('slack', 'send_message');

      const allowed1 = await gate.checkPermission('slack', 'send_message');
      const allowed2 = await gate.checkPermission('slack', 'create_channel');

      expect(allowed1).toBe(true); // Explicitly allowed
      expect(allowed2).toBe(false); // Triggers prompt (which returns false)
    });

    it('should cache and respect denied permissions', async () => {
      const dialogMock = vi.fn().mockResolvedValue(false);
      gate.setDialogHandler(dialogMock);

      const allowedFirst = await gate.checkPermission('slack');
      expect(allowedFirst).toBe(false);
      expect(dialogMock).toHaveBeenCalledTimes(1);

      // Second check should read from cached deny policy
      const allowedSecond = await gate.checkPermission('slack');
      expect(allowedSecond).toBe(false);
      expect(dialogMock).toHaveBeenCalledTimes(1); // No new call
    });

    it('should support revoking policies', async () => {
      const dialogMock = vi.fn().mockResolvedValue(true);
      gate.setDialogHandler(dialogMock);

      gate.grantPermission('hubspot');
      let allowed = await gate.checkPermission('hubspot');
      expect(allowed).toBe(true);

      gate.revokePermission('hubspot');
      allowed = await gate.checkPermission('hubspot');
      expect(allowed).toBe(true); // Prompts again since it was revoked
      expect(dialogMock).toHaveBeenCalledTimes(1);
    });
  });

  // ==============================================================================
  // 4. toolkitSlug Discovery tests
  // ==============================================================================
  describe('discoverToolkitSlug', () => {
    it('should match exact app IDs', () => {
      const app = discoverToolkitSlug('slack');
      expect(app).toBeDefined();
      expect(app?.id).toBe('slack');
      expect(app?.name).toBe('Slack');
    });

    it('should clean and discover varying toolkit slug formats', () => {
      const formats = [
        'composio/slack',
        'slack_toolkit',
        'slack-toolkit',
        'toolkit-slack',
        'slack-integration',
        'slack_integration',
      ];

      for (const format of formats) {
        const app = discoverToolkitSlug(format);
        expect(app).toBeDefined();
        expect(app?.id).toBe('slack');
      }
    });

    it('should perform substring matching for complex slugs', () => {
      // "googlecalendar" app
      const app = discoverToolkitSlug('googlecalendar_toolkit');
      expect(app).toBeDefined();
      expect(app?.id).toBe('googlecalendar');

      const appPartial = discoverToolkitSlug('calendar');
      expect(appPartial).toBeDefined();
      expect(appPartial?.id).toBe('googlecalendar');
    });

    it('should return undefined for entirely unknown toolkits', () => {
      const app = discoverToolkitSlug('totally-unknown-service');
      expect(app).toBeUndefined();
    });
  });
});
