// ==============================================================================
// GHITA CODING AGENT - SaaS App Registry (50+ Apps)
// ==============================================================================
// Type definitions and the complete SaaS application registry.
// Extracted from composioAdapter.ts for modularity.
// ==============================================================================

export type SaaSCategory =
  | 'crm'
  | 'communication'
  | 'project-management'
  | 'devops'
  | 'cloud'
  | 'finance'
  | 'productivity'
  | 'analytics'
  | 'marketing'
  | 'hr';

export interface SaaSAppDefinition {
  id: string;
  name: string;
  category: SaaSCategory;
  actions: string[];
  rateLimit: { requests: number; windowMs: number };
}

export interface SaaSConnection {
  appId: string;
  accountId?: string;
  accountLabel?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface SaaSAPILog {
  timestamp: number;
  appId: string;
  action: string;
  success: boolean;
  duration: number;
  error?: string;
}

export interface SaaSAPIResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface WebhookEvent {
  appId: string;
  event: string;
  payload: Record<string, unknown>;
  timestamp: number;
  signature?: string;
}

export interface WebhookHandler {
  appId: string;
  events: string[];
  callback: (event: WebhookEvent) => Promise<void>;
}

/** 50+ SaaS application definitions with rate limits */
export const SAAS_APPS: SaaSAppDefinition[] = [
  // CRM
  { id: 'salesforce', name: 'Salesforce', category: 'crm', actions: ['create_lead', 'update_opportunity', 'query_soql'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'hubspot', name: 'HubSpot', category: 'crm', actions: ['create_contact', 'create_deal', 'list_contacts'], rateLimit: { requests: 100, windowMs: 10000 } },
  { id: 'pipedrive', name: 'Pipedrive', category: 'crm', actions: ['create_deal', 'list_deals', 'update_person'], rateLimit: { requests: 80, windowMs: 10000 } },
  { id: 'zoho', name: 'Zoho CRM', category: 'crm', actions: ['create_lead', 'list_contacts', 'create_deal'], rateLimit: { requests: 60, windowMs: 60000 } },
  // Communication
  { id: 'slack', name: 'Slack', category: 'communication', actions: ['send_message', 'create_channel', 'list_channels'], rateLimit: { requests: 50, windowMs: 60000 } },
  { id: 'discord', name: 'Discord', category: 'communication', actions: ['send_message', 'create_channel', 'list_guilds'], rateLimit: { requests: 50, windowMs: 60000 } },
  { id: 'teams', name: 'Microsoft Teams', category: 'communication', actions: ['send_message', 'create_meeting', 'list_channels'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'zoom', name: 'Zoom', category: 'communication', actions: ['create_meeting', 'list_meetings', 'get_recording'], rateLimit: { requests: 40, windowMs: 60000 } },
  { id: 'twilio', name: 'Twilio', category: 'communication', actions: ['send_sms', 'make_call', 'list_messages'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'sendgrid', name: 'SendGrid', category: 'communication', actions: ['send_email', 'list_templates', 'get_stats'], rateLimit: { requests: 100, windowMs: 60000 } },
  // Project Management
  { id: 'jira', name: 'Jira', category: 'project-management', actions: ['create_issue', 'update_issue_status', 'list_issues'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'trello', name: 'Trello', category: 'project-management', actions: ['create_card', 'move_card', 'list_boards'], rateLimit: { requests: 100, windowMs: 10000 } },
  { id: 'asana', name: 'Asana', category: 'project-management', actions: ['create_task', 'update_task', 'list_projects'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'linear', name: 'Linear', category: 'project-management', actions: ['create_issue', 'update_issue', 'list_issues'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'clickup', name: 'ClickUp', category: 'project-management', actions: ['create_task', 'update_task', 'list_spaces'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'monday', name: 'Monday.com', category: 'project-management', actions: ['create_item', 'update_item', 'list_boards'], rateLimit: { requests: 60, windowMs: 60000 } },
  // DevOps
  { id: 'github', name: 'GitHub', category: 'devops', actions: ['create_issue', 'create_pull_request', 'add_comment', 'list_repos'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'gitlab', name: 'GitLab', category: 'devops', actions: ['create_issue', 'create_merge_request', 'list_projects'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'bitbucket', name: 'Bitbucket', category: 'devops', actions: ['create_issue', 'create_pull_request', 'list_repos'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'circleci', name: 'CircleCI', category: 'devops', actions: ['trigger_pipeline', 'list_pipelines', 'get_workflow'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'jenkins', name: 'Jenkins', category: 'devops', actions: ['trigger_build', 'list_jobs', 'get_build_info'], rateLimit: { requests: 30, windowMs: 60000 } },
  { id: 'terraform', name: 'Terraform Cloud', category: 'devops', actions: ['list_workspaces', 'create_run', 'get_state'], rateLimit: { requests: 30, windowMs: 60000 } },
  { id: 'pagerduty', name: 'PagerDuty', category: 'devops', actions: ['create_incident', 'list_incidents', 'acknowledge'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'datadog', name: 'Datadog', category: 'devops', actions: ['query_metrics', 'create_dashboard', 'list_monitors'], rateLimit: { requests: 100, windowMs: 60000 } },
  // Cloud
  { id: 'aws', name: 'AWS', category: 'cloud', actions: ['list_instances', 'deploy_lambda', 'list_s3_buckets'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'gcp', name: 'Google Cloud', category: 'cloud', actions: ['list_instances', 'deploy_cloud_run', 'list_buckets'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'azure', name: 'Azure', category: 'cloud', actions: ['list_vms', 'deploy_function', 'list_storage'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'vercel', name: 'Vercel', category: 'cloud', actions: ['deploy_project', 'list_deployments', 'get_logs'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'netlify', name: 'Netlify', category: 'cloud', actions: ['deploy_site', 'list_sites', 'get_logs'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'cloudflare', name: 'Cloudflare', category: 'cloud', actions: ['list_zones', 'purge_cache', 'list_dns_records'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'digitalocean', name: 'DigitalOcean', category: 'cloud', actions: ['list_droplets', 'create_droplet', 'list_volumes'], rateLimit: { requests: 60, windowMs: 60000 } },
  // Finance
  { id: 'stripe', name: 'Stripe', category: 'finance', actions: ['create_charge', 'list_customers', 'create_subscription'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'paypal', name: 'PayPal', category: 'finance', actions: ['create_payment', 'list_transactions', 'get_order'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'quickbooks', name: 'QuickBooks', category: 'finance', actions: ['create_invoice', 'list_customers', 'get_profit_loss'], rateLimit: { requests: 50, windowMs: 60000 } },
  { id: 'xero', name: 'Xero', category: 'finance', actions: ['create_invoice', 'list_contacts', 'get_balance_sheet'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'shopify', name: 'Shopify', category: 'finance', actions: ['get_order_details', 'list_products', 'create_product'], rateLimit: { requests: 40, windowMs: 10000 } },
  // Productivity
  { id: 'notion', name: 'Notion', category: 'productivity', actions: ['create_page', 'append_block', 'list_databases'], rateLimit: { requests: 30, windowMs: 1000 } },
  { id: 'googlecalendar', name: 'Google Calendar', category: 'productivity', actions: ['create_event', 'list_events', 'delete_event'], rateLimit: { requests: 100, windowMs: 100000 } },
  { id: 'googledrive', name: 'Google Drive', category: 'productivity', actions: ['upload_file', 'list_files', 'download_file'], rateLimit: { requests: 100, windowMs: 100000 } },
  { id: 'dropbox', name: 'Dropbox', category: 'productivity', actions: ['upload_file', 'list_files', 'create_folder'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'airtable', name: 'Airtable', category: 'productivity', actions: ['create_record', 'list_records', 'update_record'], rateLimit: { requests: 30, windowMs: 1000 } },
  { id: 'confluence', name: 'Confluence', category: 'productivity', actions: ['create_page', 'list_spaces', 'search_content'], rateLimit: { requests: 100, windowMs: 60000 } },
  // Analytics
  { id: 'mixpanel', name: 'Mixpanel', category: 'analytics', actions: ['track_event', 'query_funnel', 'list_segments'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'amplitude', name: 'Amplitude', category: 'analytics', actions: ['track_event', 'query_chart', 'list_cohorts'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'googleanalytics', name: 'Google Analytics', category: 'analytics', actions: ['run_report', 'list_properties', 'get_realtime'], rateLimit: { requests: 100, windowMs: 100000 } },
  // Marketing
  { id: 'mailchimp', name: 'Mailchimp', category: 'marketing', actions: ['create_campaign', 'list_lists', 'add_subscriber'], rateLimit: { requests: 10, windowMs: 10000 } },
  { id: 'intercom', name: 'Intercom', category: 'marketing', actions: ['send_message', 'list_contacts', 'create_ticket'], rateLimit: { requests: 100, windowMs: 60000 } },
  { id: 'zendesk', name: 'Zendesk', category: 'marketing', actions: ['create_ticket', 'list_tickets', 'add_comment'], rateLimit: { requests: 700, windowMs: 60000 } },
  { id: 'freshdesk', name: 'Freshdesk', category: 'marketing', actions: ['create_ticket', 'list_tickets', 'update_ticket'], rateLimit: { requests: 50, windowMs: 60000 } },
  // HR
  { id: 'bamboohr', name: 'BambooHR', category: 'hr', actions: ['list_employees', 'get_employee', 'request_pto'], rateLimit: { requests: 60, windowMs: 60000 } },
  { id: 'workday', name: 'Workday', category: 'hr', actions: ['list_workers', 'get_worker', 'submit_time_off'], rateLimit: { requests: 30, windowMs: 60000 } },
  { id: 'gusto', name: 'Gusto', category: 'hr', actions: ['list_employees', 'get_payroll', 'run_payroll'], rateLimit: { requests: 60, windowMs: 60000 } },
];
