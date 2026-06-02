// ==============================================================================
// GHITA CODING AGENT — Phase 17: Composio SaaS Integration Unit Tests
// ==============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComposioSkillAdapter } from '../src/registry/composioAdapter.js';

describe('ComposioSkillAdapter', () => {
  let adapter: ComposioSkillAdapter;

  beforeEach(async () => {
  adapter = await ComposioSkillAdapter.create();
  vi.clearAllMocks();
});

  // ==============================================================================
  // 1. Credentials Management & Centralized Syncing
  // ==============================================================================
  describe('Credentials Loading & Syncing', () => {
    it('should set and retrieve SaaS credentials correctly', () => {
      adapter.setCredential({
        appId: 'github',
        accessToken: 'access_123',
        refreshToken: 'refresh_123',
        expiresAt: 2000000000000,
      });

      const conn = adapter.getCredential('github');
      expect(conn).toBeDefined();
      expect(conn?.accessToken).toBe('access_123');
      expect(conn?.refreshToken).toBe('refresh_123');
      expect(conn?.expiresAt).toBe(2000000000000);
      expect(adapter.listConnectedApps()).toContain('github');
    });

    it('should sync credentials centrally from an external object', () => {
      const externalStore = {
        slack: { accessToken: 'slack_token', refreshToken: 'slack_refresh', expiresAt: 1800000000000 },
        jira: { accessToken: 'jira_token', expiresAt: 1900000000000 },
      };

      adapter.syncCredentials(externalStore);

      expect(adapter.listConnectedApps()).toContain('slack');
      expect(adapter.listConnectedApps()).toContain('jira');
      expect(adapter.getCredential('slack')?.accessToken).toBe('slack_token');
      expect(adapter.getCredential('jira')?.accessToken).toBe('jira_token');
    });

    it('should remove connection credentials when requested', () => {
      adapter.setCredential({
        appId: 'slack',
        accessToken: 'abc',
      });
      expect(adapter.listConnectedApps()).toContain('slack');
      
      const removed = adapter.removeCredential('slack');
      expect(removed).toBe(true);
      expect(adapter.listConnectedApps()).not.toContain('slack');
    });
  });

  // ==============================================================================
  // 2. OAuth Token Auto-Refresher Interceptors
  // ==============================================================================
  describe('OAuth Token Auto-Refresher Interceptor', () => {
    it('should NOT refresh token if expiresAt is in the far future', async () => {
      const farFuture = Date.now() + 2 * 60 * 60 * 1000; // 2 hours
      adapter.setCredential({
        appId: 'slack',
        accessToken: 'old_access',
        refreshToken: 'my_refresh_token',
        expiresAt: farFuture,
      });

      await adapter.interceptAndRefreshToken('slack');

      const conn = adapter.getCredential('slack');
      expect(conn?.accessToken).toBe('old_access'); // No refresh
      expect(conn?.expiresAt).toBe(farFuture);
    });

    it('should automatically refresh token if expiresAt is within 5 minutes', async () => {
      const nearFuture = Date.now() + 4 * 60 * 1000; // 4 minutes
      adapter.setCredential({
        appId: 'slack',
        accessToken: 'old_access',
        refreshToken: 'my_refresh_token',
        expiresAt: nearFuture,
      });

      const refreshSuccess = await adapter.interceptAndRefreshToken('slack');
      expect(refreshSuccess).toBe(true);

      const conn = adapter.getCredential('slack');
      expect(conn?.accessToken).toContain('refreshed_access_');
      expect(conn?.expiresAt).toBeGreaterThan(Date.now() + 3500 * 1000); // 1 hour
      expect(adapter.getLogs()).toHaveLength(1);
      expect(adapter.getLogs()[0].action).toBe('oauth.refresh_token');
    });
  });

  // ==============================================================================
  // 3. SaaS Action Mappings (All 10 default apps)
  // ==============================================================================
  describe('Simulated Default Actions Execution', () => {
    beforeEach(() => {
      // Setup credentials for all test apps
      const apps = ['slack', 'github', 'jira', 'trello', 'googlecalendar', 'zoom', 'salesforce', 'hubspot', 'shopify', 'notion'];
      for (const app of apps) {
        adapter.setCredential({ appId: app, accessToken: `${app}_mock_token` });
      }
    });

    it('should reject call immediately if name does not match app.action format', async () => {
      const res = await adapter.executeSaaSAction('invalid_format');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Invalid action name');
    });

    it('should execute slack.send_message and slack.create_channel', async () => {
      const res1 = await adapter.executeSaaSAction('slack.send_message', { channel: '#dev', text: 'Hello' });
      expect(res1.success).toBe(true);
      expect(res1.data.channel).toBe('#dev');
      expect(res1.data).toBeDefined();

      const res2 = await adapter.executeSaaSAction('slack.create_channel', { name: 'release-v2' });
      expect(res2.success).toBe(true);
      expect(res2.data.name).toBe('release-v2');
      expect(res2.data.status).toBe('created');
    });

    it('should execute github.create_issue, github.create_pull_request, github.add_comment', async () => {
      const res1 = await adapter.executeSaaSAction('github.create_issue', { title: 'Tauri window crash', repo: 'ghita/desktop' });
      expect(res1.success).toBe(true);
      expect(res1.data.title).toBe('Tauri window crash');
      expect(res1.data.issue_number).toBeGreaterThan(0);

      const res2 = await adapter.executeSaaSAction('github.create_pull_request', { title: 'Fix window bounds', head: 'fix-window', base: 'main' });
      expect(res2.success).toBe(true);
      expect(res2.data.pr_number).toBeGreaterThan(0);

      const res3 = await adapter.executeSaaSAction('github.add_comment', { issue_number: 12, body: 'Checking this issue' });
      expect(res3.success).toBe(true);
      expect(res3.data.comment_id).toBeDefined();
    });

    it('should execute jira.create_issue and jira.update_issue_status', async () => {
      const res1 = await adapter.executeSaaSAction('jira.create_issue', { summary: 'Implement Cosine similarity', type: 'Bug' });
      expect(res1.success).toBe(true);
      expect(res1.data.key).toContain('GHITA-');
      expect(res1.data.status).toBe('To Do');

      const res2 = await adapter.executeSaaSAction('jira.update_issue_status', { key: 'GHITA-204', status: 'Done' });
      expect(res2.success).toBe(true);
      expect(res2.data.key).toBe('GHITA-204');
      expect(res2.data.status).toBe('Done');
    });

    it('should execute trello.create_card and trello.move_card', async () => {
      const res1 = await adapter.executeSaaSAction('trello.create_card', { name: 'Update Plan', board_id: 'b1' });
      expect(res1.success).toBe(true);
      expect(res1.data.card_id).toBeDefined();

      const res2 = await adapter.executeSaaSAction('trello.move_card', { card_id: 'c123', list_id: 'lDone' });
      expect(res2.success).toBe(true);
      expect(res2.data.success).toBe(true);
    });

    it('should execute googlecalendar.create_event and googlecalendar.list_events', async () => {
      const res1 = await adapter.executeSaaSAction('googlecalendar.create_event', { summary: 'Sprint Retrospective' });
      expect(res1.success).toBe(true);
      expect(res1.data.event_id).toBeDefined();

      const res2 = await adapter.executeSaaSAction('googlecalendar.list_events');
      expect(res2.success).toBe(true);
      expect(res2.data).toHaveLength(2);
    });

    it('should execute zoom.create_meeting', async () => {
      const res = await adapter.executeSaaSAction('zoom.create_meeting', { topic: 'Daily sync' });
      expect(res.success).toBe(true);
      expect(res.data.meeting_id).toBeGreaterThan(0);
      expect(res.data.join_url).toBeDefined();
    });

    it('should execute salesforce.create_lead and salesforce.update_opportunity', async () => {
      const res1 = await adapter.executeSaaSAction('salesforce.create_lead', { name: 'Alice Smith', company: 'Acme Inc' });
      expect(res1.success).toBe(true);
      expect(res1.data.lead_id).toBeDefined();

      const res2 = await adapter.executeSaaSAction('salesforce.update_opportunity', { opportunity_id: 'opp1', stage: 'Closed Won' });
      expect(res2.success).toBe(true);
      expect(res2.data.success).toBe(true);
    });

    it('should execute hubspot.create_contact', async () => {
      const res = await adapter.executeSaaSAction('hubspot.create_contact', { email: 'test@gmail.com', firstname: 'Bob' });
      expect(res.success).toBe(true);
      expect(res.data.contact_id).toBeDefined();
    });

    it('should execute shopify.get_order_details', async () => {
      const res = await adapter.executeSaaSAction('shopify.get_order_details', { order_id: '#500' });
      expect(res.success).toBe(true);
      expect(res.data.order_id).toBe('#500');
    });

    it('should execute notion.create_page and notion.append_block', async () => {
      const res1 = await adapter.executeSaaSAction('notion.create_page', { database_id: 'db1', title: 'Roadmap docs' });
      expect(res1.success).toBe(true);
      expect(res1.data.page_id).toBeDefined();

      const res2 = await adapter.executeSaaSAction('notion.append_block', { block_id: 'b12' });
      expect(res2.success).toBe(true);
      expect(res2.data.success).toBe(true);
    });
  });

  // ==============================================================================
  // 4. Faulty SaaS Tools Auto-Isolation
  // ==============================================================================
  describe('Faulty Tools Auto-Isolation Mechanism', () => {
    beforeEach(() => {
      adapter.setCredential({ appId: 'slack', accessToken: 'slack_token' });
    });

    it('should count failures and isolate the app after 3 consecutive failures', async () => {
      expect(adapter.isIsolated('slack')).toBe(false);

      // Failure 1
      const res1 = await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      expect(res1.success).toBe(false);
      expect(adapter.isIsolated('slack')).toBe(false);

      // Failure 2
      const res2 = await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      expect(res2.success).toBe(false);
      expect(adapter.isIsolated('slack')).toBe(false);

      // Failure 3
      const res3 = await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      expect(res3.success).toBe(false);
      
      // Slack must be isolated now!
      expect(adapter.isIsolated('slack')).toBe(true);
      expect(adapter.getIsolatedApps()).toContain('slack');

      // Call 4 (should be blocked by isolation immediately without executing)
      const res4 = await adapter.executeSaaSAction('slack.send_message');
      expect(res4.success).toBe(false);
      expect(res4.error).toContain('is isolated due to repeated failures');
    });

    it('should reset consecutive failures counter upon any successful action execution', async () => {
      // Failure 1
      await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      // Failure 2
      await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      
      // Success (should reset counter)
      const resOk = await adapter.executeSaaSAction('slack.send_message', { text: 'Reset me' });
      expect(resOk.success).toBe(true);
      expect(adapter.isIsolated('slack')).toBe(false);

      // Another failure (should count as 1, not 3)
      await adapter.executeSaaSAction('slack.send_message', { simulate_failure: true });
      expect(adapter.isIsolated('slack')).toBe(false);
    });

    it('should release isolation manually and reset failures when requested', async () => {
      // Isolate app
      adapter.isolateApp('slack');
      expect(adapter.isIsolated('slack')).toBe(true);

      // Release isolation
      adapter.releaseIsolation('slack');
      expect(adapter.isIsolated('slack')).toBe(false);

      // Should be able to execute again
      const res = await adapter.executeSaaSAction('slack.send_message', { text: 'Back online' });
      expect(res.success).toBe(true);
    });
  });
});
