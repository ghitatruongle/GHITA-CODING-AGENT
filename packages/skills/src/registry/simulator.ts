// ==============================================================================
// GHITA CODING AGENT - SaaS Action Simulator
// ==============================================================================
// Simulated responses for 50+ SaaS app actions.
// Extracted from composioAdapter.ts for testability and modularity.
// ==============================================================================

/** Simulate a SaaS API action when no real SDK is available. */
export async function simulateAction(
  appId: string,
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  await new Promise((resolve) => setTimeout(resolve, 30));

  if (params['simulate_failure']) {
    throw new Error(`[SIMULATION ERROR] API connection failed for ${appId}`);
  }

  const a = action.toLowerCase();

  // --- Slack ---
  if (appId === 'slack') {
    if (a === 'send_message') return { channel: params['channel'] ?? '#general', message_id: `slack_msg_${Date.now()}`, status: 'sent' };
    if (a === 'create_channel') return { channel_id: `chan_${Date.now()}`, name: params['name'] ?? 'new-channel', status: 'created' };
    if (a === 'list_channels') return [{ id: 'C1', name: 'general' }, { id: 'C2', name: 'random' }];
  }
  // --- GitHub ---
  if (appId === 'github') {
    if (a === 'create_issue') return { issue_number: Math.floor(Math.random() * 1000) + 1, title: params['title'] ?? 'Issue', state: 'open' };
    if (a === 'create_pull_request') return { pr_number: Math.floor(Math.random() * 500) + 1, title: params['title'] ?? 'PR', state: 'open' };
    if (a === 'add_comment') return { comment_id: Date.now(), body: params['body'] ?? 'Comment' };
    if (a === 'list_repos') return [{ name: 'repo-1', private: false }, { name: 'repo-2', private: true }];
  }
  // --- Jira ---
  if (appId === 'jira') {
    if (a === 'create_issue') return { key: `GHITA-${Math.floor(Math.random() * 9000) + 1000}`, summary: params['summary'] ?? 'Issue', status: 'To Do' };
    if (a === 'update_issue_status') return { key: params['key'] ?? 'GHITA-101', status: params['status'] ?? 'In Progress', updated: true };
    if (a === 'list_issues') return [{ key: 'GHITA-1', summary: 'First issue' }];
  }
  // --- Trello ---
  if (appId === 'trello') {
    if (a === 'create_card') return { card_id: `card_${Math.random().toString(36).slice(2, 10)}`, name: params['name'] ?? 'Card' };
    if (a === 'move_card') return { card_id: params['card_id'] ?? 'card_123', success: true };
    if (a === 'list_boards') return [{ id: 'B1', name: 'Main Board' }];
  }
  // --- Google Calendar ---
  if (appId === 'googlecalendar') {
    if (a === 'create_event') return { event_id: `evt_${Date.now()}`, summary: params['summary'] ?? 'Event' };
    if (a === 'list_events') return [{ event_id: 'evt_1', summary: 'Standup' }, { event_id: 'evt_2', summary: 'Review' }];
    if (a === 'delete_event') return { success: true };
  }
  // --- Zoom ---
  if (appId === 'zoom') {
    if (a === 'create_meeting') return { meeting_id: Math.floor(Math.random() * 900000000) + 100000000, topic: params['topic'] ?? 'Meeting', join_url: 'https://zoom.us/j/123' };
    if (a === 'list_meetings') return [{ id: 'M1', topic: 'Daily' }];
  }
  // --- Salesforce ---
  if (appId === 'salesforce') {
    if (a === 'create_lead') return { lead_id: `lead_${Math.random().toString(36).slice(2, 10)}`, name: params['name'] ?? 'Lead', status: 'Open' };
    if (a === 'update_opportunity') return { opportunity_id: params['opportunity_id'] ?? 'opp_99', success: true };
    if (a === 'query_soql') return { totalSize: 5, records: [{ Name: 'Acme Corp' }] };
  }
  // --- HubSpot ---
  if (appId === 'hubspot') {
    if (a === 'create_contact') return { contact_id: `hs_${Math.floor(Math.random() * 1000000)}`, email: params['email'] ?? 'user@example.com' };
    if (a === 'create_deal') return { deal_id: `deal_${Date.now()}`, amount: params['amount'] ?? 10000 };
    if (a === 'list_contacts') return [{ id: 'C1', email: 'user@example.com' }];
  }
  // --- Shopify ---
  if (appId === 'shopify') {
    if (a === 'get_order_details') return { order_id: params['order_id'] ?? '#1024', total_price: '299.00', currency: 'USD' };
    if (a === 'list_products') return [{ id: 'P1', title: 'Widget', price: '19.99' }];
    if (a === 'create_product') return { id: `P_${Date.now()}`, title: params['title'] ?? 'New Product' };
  }
  // --- Notion ---
  if (appId === 'notion') {
    if (a === 'create_page') return { page_id: `page_${Math.random().toString(36).slice(2, 10)}`, title: params['title'] ?? 'Page' };
    if (a === 'append_block') return { block_id: `block_${Date.now()}`, success: true };
    if (a === 'list_databases') return [{ id: 'DB1', title: 'Tasks' }];
  }
  // --- Discord ---
  if (appId === 'discord') {
    if (a === 'send_message') return { message_id: `dc_msg_${Date.now()}`, channel_id: params['channel_id'] ?? 'C1', status: 'sent' };
    if (a === 'create_channel') return { id: `ch_${Date.now()}`, name: params['name'] ?? 'new-channel' };
    if (a === 'list_guilds') return [{ id: 'G1', name: 'Dev Server' }];
  }
  // --- Teams ---
  if (appId === 'teams') {
    if (a === 'send_message') return { id: `msg_${Date.now()}`, status: 'sent' };
    if (a === 'create_meeting') return { id: `mtg_${Date.now()}`, joinUrl: 'https://teams.microsoft.com/l/meetup-join/123' };
  }
  // --- Twilio ---
  if (appId === 'twilio') {
    if (a === 'send_sms') return { sid: `SM${Math.random().toString(36).slice(2, 14)}`, to: params['to'], status: 'queued' };
    if (a === 'make_call') return { sid: `CA${Math.random().toString(36).slice(2, 14)}`, status: 'initiated' };
  }
  // --- SendGrid ---
  if (appId === 'sendgrid') {
    if (a === 'send_email') return { message_id: `sg_${Date.now()}`, status: 'accepted' };
    if (a === 'list_templates') return [{ id: 'T1', name: 'Welcome' }];
  }
  // --- Asana ---
  if (appId === 'asana') {
    if (a === 'create_task') return { gid: `${Date.now()}`, name: params['name'] ?? 'Task' };
    if (a === 'list_projects') return [{ gid: 'P1', name: 'Project Alpha' }];
  }
  // --- Linear ---
  if (appId === 'linear') {
    if (a === 'create_issue') return { id: `LIN-${Date.now()}`, title: params['title'] ?? 'Issue', state: 'Backlog' };
    if (a === 'list_issues') return [{ id: 'LIN-1', title: 'First issue' }];
  }
  // --- ClickUp ---
  if (appId === 'clickup') {
    if (a === 'create_task') return { id: `${Date.now()}`, name: params['name'] ?? 'Task' };
  }
  // --- Monday ---
  if (appId === 'monday') {
    if (a === 'create_item') return { id: `${Date.now()}`, name: params['name'] ?? 'Item' };
  }
  // --- GitLab ---
  if (appId === 'gitlab') {
    if (a === 'create_issue') return { iid: Math.floor(Math.random() * 1000), title: params['title'] ?? 'Issue' };
    if (a === 'create_merge_request') return { iid: Math.floor(Math.random() * 500), title: params['title'] ?? 'MR' };
  }
  // --- Bitbucket ---
  if (appId === 'bitbucket') {
    if (a === 'create_issue') return { id: Math.floor(Math.random() * 1000), title: params['title'] ?? 'Issue' };
  }
  // --- CircleCI ---
  if (appId === 'circleci') {
    if (a === 'trigger_pipeline') return { id: `pipe_${Date.now()}`, state: 'pending' };
  }
  // --- Jenkins ---
  if (appId === 'jenkins') {
    if (a === 'trigger_build') return { number: Math.floor(Math.random() * 1000), result: 'SUCCESS' };
  }
  // --- PagerDuty ---
  if (appId === 'pagerduty') {
    if (a === 'create_incident') return { id: `INC_${Date.now()}`, title: params['title'] ?? 'Incident', status: 'triggered' };
  }
  // --- AWS ---
  if (appId === 'aws') {
    if (a === 'list_instances') return [{ id: 'i-123', state: 'running', type: 't3.micro' }];
    if (a === 'deploy_lambda') return { function_name: params['function_name'] ?? 'my-func', version: '$LATEST' };
  }
  // --- GCP ---
  if (appId === 'gcp') {
    if (a === 'list_instances') return [{ name: 'instance-1', status: 'RUNNING' }];
  }
  // --- Azure ---
  if (appId === 'azure') {
    if (a === 'list_vms') return [{ name: 'vm-1', status: 'PowerState/running' }];
  }
  // --- Vercel ---
  if (appId === 'vercel') {
    if (a === 'deploy_project') return { id: `dpl_${Date.now()}`, url: 'https://my-app.vercel.app', state: 'READY' };
    if (a === 'list_deployments') return [{ id: 'D1', url: 'https://my-app.vercel.app' }];
  }
  // --- Netlify ---
  if (appId === 'netlify') {
    if (a === 'deploy_site') return { id: `site_${Date.now()}`, url: 'https://my-site.netlify.app', state: 'ready' };
  }
  // --- Cloudflare ---
  if (appId === 'cloudflare') {
    if (a === 'list_zones') return [{ id: 'Z1', name: 'example.com', status: 'active' }];
    if (a === 'purge_cache') return { success: true };
  }
  // --- DigitalOcean ---
  if (appId === 'digitalocean') {
    if (a === 'list_droplets') return [{ id: 123, name: 'web-1', status: 'active' }];
  }
  // --- Stripe ---
  if (appId === 'stripe') {
    if (a === 'create_charge') return { id: `ch_${Date.now()}`, amount: params['amount'] ?? 1000, currency: 'usd', status: 'succeeded' };
    if (a === 'list_customers') return [{ id: 'cus_1', email: 'customer@example.com' }];
    if (a === 'create_subscription') return { id: `sub_${Date.now()}`, status: 'active' };
  }
  // --- PayPal ---
  if (appId === 'paypal') {
    if (a === 'create_payment') return { id: `PAY_${Date.now()}`, state: 'approved' };
  }
  // --- QuickBooks ---
  if (appId === 'quickbooks') {
    if (a === 'create_invoice') return { Id: `${Date.now()}`, TotalAmt: params['amount'] ?? 100, status: 'Sent' };
  }
  // --- Xero ---
  if (appId === 'xero') {
    if (a === 'create_invoice') return { InvoiceID: `INV_${Date.now()}`, status: 'AUTHORISED' };
  }
  // --- Dropbox ---
  if (appId === 'dropbox') {
    if (a === 'upload_file') return { id: `dbx_${Date.now()}`, name: params['name'] ?? 'file.txt', size: 1024 };
  }
  // --- Airtable ---
  if (appId === 'airtable') {
    if (a === 'create_record') return { id: `rec_${Date.now()}`, fields: params['fields'] ?? {} };
  }
  // --- Confluence ---
  if (appId === 'confluence') {
    if (a === 'create_page') return { id: `page_${Date.now()}`, title: params['title'] ?? 'Page' };
  }
  // --- Mixpanel / Amplitude ---
  if (appId === 'mixpanel' || appId === 'amplitude') {
    if (a === 'track_event') return { success: true, event: params['event'] ?? 'test_event' };
  }
  // --- Mailchimp ---
  if (appId === 'mailchimp') {
    if (a === 'create_campaign') return { id: `camp_${Date.now()}`, status: 'save' };
    if (a === 'add_subscriber') return { id: `sub_${Date.now()}`, email: params['email'] ?? 'user@example.com', status: 'subscribed' };
  }
  // --- Intercom ---
  if (appId === 'intercom') {
    if (a === 'send_message') return { id: `msg_${Date.now()}`, type: 'email', status: 'sent' };
  }
  // --- Zendesk / Freshdesk ---
  if (appId === 'zendesk' || appId === 'freshdesk') {
    if (a === 'create_ticket') return { id: Math.floor(Math.random() * 10000), subject: params['subject'] ?? 'Ticket', status: 'open' };
  }
  // --- BambooHR / Workday / Gusto ---
  if (appId === 'bamboohr' || appId === 'workday' || appId === 'gusto') {
    if (a === 'list_employees' || a === 'list_workers') return [{ id: 'E1', name: 'John Doe', status: 'active' }];
  }

  // Default response for unmatched actions
  return { message: `Executed "${action}" on "${appId}" via simulator.`, params };
}
