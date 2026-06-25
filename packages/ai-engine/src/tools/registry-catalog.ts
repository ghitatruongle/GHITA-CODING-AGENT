// ==============================================================================
// GHITA CODING AGENT - Tool Catalog (200+ Composio-pattern definitions)
// ==============================================================================
// Skeleton definitions cho 200+ tools. Moi tool co metadata day du, handler la
// stub tra ve status 'requires_credentials'. When tich hop that voi SaaS app,
// handler se thay the bang implementation.
// ==============================================================================

import type { ToolDefinition, ToolSource, CatalogGroup } from './registry-types.js';
import type { ToolRegistry } from './registry.js';

// ----------------------------------------------------------------------------
// 200+ tool catalog definitions
// ----------------------------------------------------------------------------

/** 200+ tool catalog grouped by app/category */
export const TOOL_CATALOG: CatalogGroup[] = [
  {
    app: 'discord',
    category: 'Communication',
    tools: [
      {
        name: 'discord_send',
        description: 'Send message to Discord channel',
        parameters: {
          type: 'object',
          properties: { channel: { type: 'string' }, text: { type: 'string' } },
          required: ['channel', 'text'],
        },
        rateLimit: 30,
      },
      {
        name: 'discord_list_guilds',
        description: 'List Discord guilds',
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
  {
    app: 'github',
    category: 'DevOps',
    tools: [
      {
        name: 'github_create_issue',
        description: 'Create a GitHub issue',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            title: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['repo', 'title'],
        },
      },
      {
        name: 'github_list_prs',
        description: 'List pull requests in a repo',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            state: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' },
          },
          required: ['repo'],
        },
      },
      {
        name: 'github_create_pr',
        description: 'Create a pull request',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            title: { type: 'string' },
            head: { type: 'string' },
            base: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['repo', 'title', 'head', 'base'],
        },
      },
      {
        name: 'github_merge_pr',
        description: 'Merge a pull request',
        parameters: {
          type: 'object',
          properties: { repo: { type: 'string' }, prNumber: { type: 'number' } },
          required: ['repo', 'prNumber'],
        },
        requiresApproval: true,
      },
      {
        name: 'github_search_repos',
        description: 'Search GitHub repos',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      },
      {
        name: 'github_get_file',
        description: 'Get file content from repo',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            path: { type: 'string' },
            ref: { type: 'string' },
          },
          required: ['repo', 'path'],
        },
      },
      {
        name: 'github_create_release',
        description: 'Create GitHub release',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            tag: { type: 'string' },
            name: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['repo', 'tag'],
        },
      },
      {
        name: 'github_list_workflows',
        description: 'List GitHub Actions workflows',
        parameters: {
          type: 'object',
          properties: { repo: { type: 'string' } },
          required: ['repo'],
        },
      },
      {
        name: 'github_trigger_workflow',
        description: 'Trigger a workflow run',
        parameters: {
          type: 'object',
          properties: {
            repo: { type: 'string' },
            workflow: { type: 'string' },
            ref: { type: 'string', default: 'main' },
          },
          required: ['repo', 'workflow'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'gitlab',
    category: 'DevOps',
    tools: [
      {
        name: 'gitlab_create_issue',
        description: 'Create GitLab issue',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['project', 'title'],
        },
      },
      {
        name: 'gitlab_list_mrs',
        description: 'List GitLab merge requests',
        parameters: {
          type: 'object',
          properties: { project: { type: 'string' } },
          required: ['project'],
        },
      },
      {
        name: 'gitlab_create_mr',
        description: 'Create GitLab merge request',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            sourceBranch: { type: 'string' },
            targetBranch: { type: 'string' },
            title: { type: 'string' },
          },
          required: ['project', 'sourceBranch', 'targetBranch', 'title'],
        },
      },
    ],
  },
  {
    app: 'jira',
    category: 'Project-Management',
    tools: [
      {
        name: 'jira_create_issue',
        description: 'Create Jira issue',
        parameters: {
          type: 'object',
          properties: {
            project: { type: 'string' },
            summary: { type: 'string' },
            description: { type: 'string' },
            issueType: { type: 'string', default: 'Task' },
          },
          required: ['project', 'summary'],
        },
      },
      {
        name: 'jira_list_issues',
        description: 'List Jira issues with JQL',
        parameters: { type: 'object', properties: { jql: { type: 'string' } } },
      },
      {
        name: 'jira_transition',
        description: 'Transition issue status',
        parameters: {
          type: 'object',
          properties: { issueKey: { type: 'string' }, transition: { type: 'string' } },
          required: ['issueKey', 'transition'],
        },
      },
      {
        name: 'jira_add_comment',
        description: 'Add comment to Jira issue',
        parameters: {
          type: 'object',
          properties: { issueKey: { type: 'string' }, body: { type: 'string' } },
          required: ['issueKey', 'body'],
        },
      },
      {
        name: 'jira_assign',
        description: 'Assign Jira issue to user',
        parameters: {
          type: 'object',
          properties: { issueKey: { type: 'string' }, accountId: { type: 'string' } },
          required: ['issueKey', 'accountId'],
        },
      },
    ],
  },
  {
    app: 'linear',
    category: 'Project-Management',
    tools: [
      {
        name: 'linear_create_issue',
        description: 'Create Linear issue',
        parameters: {
          type: 'object',
          properties: {
            team: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['team', 'title'],
        },
      },
      {
        name: 'linear_list_issues',
        description: 'List Linear issues',
        parameters: { type: 'object', properties: { team: { type: 'string' } } },
      },
      {
        name: 'linear_update_issue',
        description: 'Update Linear issue',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            state: { type: 'string' },
          },
          required: ['id'],
        },
      },
    ],
  },
  {
    app: 'notion',
    category: 'Productivity',
    tools: [
      {
        name: 'notion_search',
        description: 'Search Notion pages and databases',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
      {
        name: 'notion_create_page',
        description: 'Create a Notion page',
        parameters: {
          type: 'object',
          properties: {
            parent: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
          },
          required: ['parent', 'title'],
        },
      },
      {
        name: 'notion_update_page',
        description: 'Update Notion page content',
        parameters: {
          type: 'object',
          properties: { pageId: { type: 'string' }, content: { type: 'string' } },
          required: ['pageId', 'content'],
        },
      },
      {
        name: 'notion_query_database',
        description: 'Query a Notion database',
        parameters: {
          type: 'object',
          properties: { database: { type: 'string' }, filter: { type: 'object' } },
          required: ['database'],
        },
      },
    ],
  },
  {
    app: 'stripe',
    category: 'Finance',
    tools: [
      {
        name: 'stripe_create_customer',
        description: 'Create Stripe customer',
        parameters: {
          type: 'object',
          properties: { email: { type: 'string' }, name: { type: 'string' } },
          required: ['email'],
        },
      },
      {
        name: 'stripe_create_charge',
        description: 'Create Stripe charge',
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string' },
            customer: { type: 'string' },
          },
          required: ['amount', 'currency', 'customer'],
        },
        requiresApproval: true,
      },
      {
        name: 'stripe_create_refund',
        description: 'Create Stripe refund',
        parameters: {
          type: 'object',
          properties: { chargeId: { type: 'string' }, amount: { type: 'number' } },
          required: ['chargeId'],
        },
        requiresApproval: true,
      },
      {
        name: 'stripe_list_payments',
        description: 'List recent payments',
        parameters: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
      },
    ],
  },
  {
    app: 'gmail',
    category: 'Communication',
    tools: [
      {
        name: 'gmail_send',
        description: 'Send email via Gmail',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
        rateLimit: 100,
      },
      {
        name: 'gmail_list',
        description: 'List recent emails',
        parameters: {
          type: 'object',
          properties: { maxResults: { type: 'number', default: 10 }, query: { type: 'string' } },
        },
      },
      {
        name: 'gmail_get',
        description: 'Get email by ID',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      {
        name: 'gmail_reply',
        description: 'Reply to email',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' }, body: { type: 'string' } },
          required: ['id', 'body'],
        },
      },
      {
        name: 'gmail_label',
        description: 'Apply label to email',
        parameters: {
          type: 'object',
          properties: { id: { type: 'string' }, label: { type: 'string' } },
          required: ['id', 'label'],
        },
      },
      {
        name: 'gmail_archive',
        description: 'Archive an email',
        parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      {
        name: 'gmail_draft',
        description: 'Create email draft',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ],
  },
  {
    app: 'slack',
    category: 'Communication',
    tools: [
      {
        name: 'slack_post',
        description: 'Post message to Slack channel',
        parameters: {
          type: 'object',
          properties: { channel: { type: 'string' }, text: { type: 'string' } },
          required: ['channel', 'text'],
        },
        rateLimit: 60,
        requiresApproval: true,
      },
      {
        name: 'slack_list_channels',
        description: 'List all Slack channels',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'slack_history',
        description: 'Get channel message history',
        parameters: {
          type: 'object',
          properties: { channel: { type: 'string' }, limit: { type: 'number', default: 20 } },
          required: ['channel'],
        },
      },
      {
        name: 'slack_react',
        description: 'Add emoji reaction to message',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string' },
            ts: { type: 'string' },
            emoji: { type: 'string' },
          },
          required: ['channel', 'ts', 'emoji'],
        },
      },
      {
        name: 'slack_schedule',
        description: 'Schedule a Slack message',
        parameters: {
          type: 'object',
          properties: {
            channel: { type: 'string' },
            text: { type: 'string' },
            postAt: { type: 'number' },
          },
          required: ['channel', 'text', 'postAt'],
        },
      },
      {
        name: 'slack_user_info',
        description: 'Get Slack user info',
        parameters: {
          type: 'object',
          properties: { user: { type: 'string' } },
          required: ['user'],
        },
      },
    ],
  },
  {
    app: 'shopify',
    category: 'Finance',
    tools: [
      {
        name: 'shopify_list_products',
        description: 'List Shopify products',
        parameters: { type: 'object', properties: { limit: { type: 'number', default: 20 } } },
      },
      {
        name: 'shopify_create_product',
        description: 'Create Shopify product',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' }, price: { type: 'string' } },
          required: ['title', 'price'],
        },
      },
    ],
  },
  {
    app: 'hubspot',
    category: 'CRM',
    tools: [
      {
        name: 'hubspot_create_contact',
        description: 'Create HubSpot contact',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string' },
            firstname: { type: 'string' },
            lastname: { type: 'string' },
          },
          required: ['email'],
        },
      },
      {
        name: 'hubspot_list_deals',
        description: 'List HubSpot deals',
        parameters: { type: 'object', properties: { limit: { type: 'number', default: 20 } } },
      },
    ],
  },
  {
    app: 'salesforce',
    category: 'CRM',
    tools: [
      {
        name: 'salesforce_query',
        description: 'Run SOQL query',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      },
      {
        name: 'salesforce_create_lead',
        description: 'Create Salesforce lead',
        parameters: {
          type: 'object',
          properties: { lastName: { type: 'string' }, company: { type: 'string' } },
          required: ['lastName', 'company'],
        },
      },
    ],
  },
  {
    app: 'asana',
    category: 'Project-Management',
    tools: [
      {
        name: 'asana_create_task',
        description: 'Create Asana task',
        parameters: {
          type: 'object',
          properties: { project: { type: 'string' }, name: { type: 'string' } },
          required: ['project', 'name'],
        },
      },
      {
        name: 'asana_list_tasks',
        description: 'List Asana tasks',
        parameters: { type: 'object', properties: { project: { type: 'string' } } },
      },
    ],
  },
  {
    app: 'trello',
    category: 'Project-Management',
    tools: [
      {
        name: 'trello_create_card',
        description: 'Create Trello card',
        parameters: {
          type: 'object',
          properties: { list: { type: 'string' }, name: { type: 'string' } },
          required: ['list', 'name'],
        },
      },
    ],
  },
  {
    app: 'dropbox',
    category: 'Cloud',
    tools: [
      {
        name: 'dropbox_upload',
        description: 'Upload file to Dropbox',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
        },
      },
      {
        name: 'dropbox_list',
        description: 'List Dropbox files',
        parameters: { type: 'object', properties: { path: { type: 'string', default: '' } } },
      },
    ],
  },
  {
    app: 'gdrive',
    category: 'Cloud',
    tools: [
      {
        name: 'gdrive_upload',
        description: 'Upload file to Google Drive',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' }, content: { type: 'string' } },
          required: ['name', 'content'],
        },
      },
      {
        name: 'gdrive_list',
        description: 'List Google Drive files',
        parameters: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ],
  },
  {
    app: 's3',
    category: 'Cloud',
    tools: [
      {
        name: 's3_put_object',
        description: 'Upload object to S3',
        parameters: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            key: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['bucket', 'key', 'body'],
        },
      },
      {
        name: 's3_list_objects',
        description: 'List S3 objects',
        parameters: {
          type: 'object',
          properties: { bucket: { type: 'string' }, prefix: { type: 'string' } },
          required: ['bucket'],
        },
      },
    ],
  },
  {
    app: 'aws',
    category: 'Cloud',
    tools: [
      {
        name: 'aws_lambda_invoke',
        description: 'Invoke AWS Lambda function',
        parameters: {
          type: 'object',
          properties: { function: { type: 'string' }, payload: { type: 'object' } },
          required: ['function'],
        },
      },
      {
        name: 'aws_ec2_list',
        description: 'List EC2 instances',
        parameters: { type: 'object', properties: { region: { type: 'string' } } },
      },
      {
        name: 'aws_sqs_send',
        description: 'Send SQS message',
        parameters: {
          type: 'object',
          properties: { queue: { type: 'string' }, body: { type: 'string' } },
          required: ['queue', 'body'],
        },
      },
    ],
  },
  {
    app: 'gcp',
    category: 'Cloud',
    tools: [
      {
        name: 'gcp_storage_upload',
        description: 'Upload to GCS',
        parameters: {
          type: 'object',
          properties: {
            bucket: { type: 'string' },
            object: { type: 'string' },
            data: { type: 'string' },
          },
          required: ['bucket', 'object', 'data'],
        },
      },
    ],
  },
  {
    app: 'azure',
    category: 'Cloud',
    tools: [
      {
        name: 'azure_blob_upload',
        description: 'Upload to Azure Blob',
        parameters: {
          type: 'object',
          properties: {
            container: { type: 'string' },
            blob: { type: 'string' },
            data: { type: 'string' },
          },
          required: ['container', 'blob', 'data'],
        },
      },
    ],
  },
  {
    app: 'sentry',
    category: 'Analytics',
    tools: [
      {
        name: 'sentry_list_issues',
        description: 'List Sentry issues',
        parameters: {
          type: 'object',
          properties: { project: { type: 'string' } },
          required: ['project'],
        },
      },
      {
        name: 'sentry_capture',
        description: 'Capture an error event',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            level: { type: 'string', enum: ['error', 'warning', 'info'] },
          },
          required: ['message'],
        },
      },
    ],
  },
  {
    app: 'datadog',
    category: 'Analytics',
    tools: [
      {
        name: 'datadog_send_metric',
        description: 'Send custom metric',
        parameters: {
          type: 'object',
          properties: { metric: { type: 'string' }, value: { type: 'number' } },
          required: ['metric', 'value'],
        },
      },
    ],
  },
  {
    app: 'figma',
    category: 'Productivity',
    tools: [
      {
        name: 'figma_get_file',
        description: 'Get Figma file',
        parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
      },
    ],
  },
  {
    app: 'miro',
    category: 'Productivity',
    tools: [
      {
        name: 'miro_create_board',
        description: 'Create Miro board',
        parameters: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
      },
    ],
  },
  {
    app: 'calendar',
    category: 'Productivity',
    tools: [
      {
        name: 'google_calendar_create_event',
        description: 'Create calendar event',
        parameters: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            start: { type: 'string' },
            end: { type: 'string' },
          },
          required: ['summary', 'start', 'end'],
        },
      },
      {
        name: 'google_calendar_list_events',
        description: 'List upcoming events',
        parameters: { type: 'object', properties: { maxResults: { type: 'number', default: 10 } } },
      },
    ],
  },
  {
    app: 'twitter',
    category: 'Marketing',
    tools: [
      {
        name: 'twitter_post',
        description: 'Post tweet',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
        rateLimit: 50,
        requiresApproval: true,
      },
      {
        name: 'twitter_search',
        description: 'Search tweets',
        parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      },
    ],
  },
  {
    app: 'linkedin',
    category: 'Marketing',
    tools: [
      {
        name: 'linkedin_post',
        description: 'Post to LinkedIn',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'mailchimp',
    category: 'Marketing',
    tools: [
      {
        name: 'mailchimp_create_campaign',
        description: 'Create Mailchimp campaign',
        parameters: {
          type: 'object',
          properties: { list: { type: 'string' }, subject: { type: 'string' } },
          required: ['list', 'subject'],
        },
      },
    ],
  },
  {
    app: 'sendgrid',
    category: 'Marketing',
    tools: [
      {
        name: 'sendgrid_send',
        description: 'Send email via SendGrid',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            html: { type: 'string' },
          },
          required: ['to', 'subject', 'html'],
        },
      },
    ],
  },
  {
    app: 'twilio',
    category: 'Communication',
    tools: [
      {
        name: 'twilio_sms',
        description: 'Send SMS via Twilio',
        parameters: {
          type: 'object',
          properties: { to: { type: 'string' }, body: { type: 'string' } },
          required: ['to', 'body'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'zendesk',
    category: 'CRM',
    tools: [
      {
        name: 'zendesk_create_ticket',
        description: 'Create Zendesk ticket',
        parameters: {
          type: 'object',
          properties: { subject: { type: 'string' }, description: { type: 'string' } },
          required: ['subject', 'description'],
        },
      },
    ],
  },
  {
    app: 'intercom',
    category: 'CRM',
    tools: [
      {
        name: 'intercom_send_message',
        description: 'Send Intercom message',
        parameters: {
          type: 'object',
          properties: { userId: { type: 'string' }, text: { type: 'string' } },
          required: ['userId', 'text'],
        },
      },
    ],
  },
  {
    app: 'airtable',
    category: 'Productivity',
    tools: [
      {
        name: 'airtable_list_records',
        description: 'List Airtable records',
        parameters: {
          type: 'object',
          properties: { base: { type: 'string' }, table: { type: 'string' } },
          required: ['base', 'table'],
        },
      },
      {
        name: 'airtable_create_record',
        description: 'Create Airtable record',
        parameters: {
          type: 'object',
          properties: {
            base: { type: 'string' },
            table: { type: 'string' },
            fields: { type: 'object' },
          },
          required: ['base', 'table', 'fields'],
        },
      },
    ],
  },
  {
    app: 'typeform',
    category: 'Productivity',
    tools: [
      {
        name: 'typeform_list_responses',
        description: 'List Typeform responses',
        parameters: {
          type: 'object',
          properties: { form: { type: 'string' } },
          required: ['form'],
        },
      },
    ],
  },
  {
    app: 'calendly',
    category: 'Productivity',
    tools: [
      {
        name: 'calendly_list_events',
        description: 'List Calendly events',
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
  {
    app: 'zoom',
    category: 'Communication',
    tools: [
      {
        name: 'zoom_create_meeting',
        description: 'Create Zoom meeting',
        parameters: {
          type: 'object',
          properties: { topic: { type: 'string' }, startTime: { type: 'string' } },
          required: ['topic', 'startTime'],
        },
      },
    ],
  },
  {
    app: 'google-sheets',
    category: 'Productivity',
    tools: [
      {
        name: 'sheets_append_row',
        description: 'Append row to Google Sheet',
        parameters: {
          type: 'object',
          properties: {
            spreadsheet: { type: 'string' },
            sheet: { type: 'string' },
            values: { type: 'array' },
          },
          required: ['spreadsheet', 'values'],
        },
      },
      {
        name: 'sheets_read',
        description: 'Read sheet values',
        parameters: {
          type: 'object',
          properties: { spreadsheet: { type: 'string' }, range: { type: 'string' } },
          required: ['spreadsheet', 'range'],
        },
      },
    ],
  },
  {
    app: 'google-docs',
    category: 'Productivity',
    tools: [
      {
        name: 'docs_create',
        description: 'Create Google Doc',
        parameters: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
        },
      },
    ],
  },
  {
    app: 'firebase',
    category: 'DevOps',
    tools: [
      {
        name: 'firebase_deploy',
        description: 'Deploy to Firebase',
        parameters: {
          type: 'object',
          properties: { project: { type: 'string' } },
          required: ['project'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'vercel',
    category: 'DevOps',
    tools: [
      {
        name: 'vercel_deploy',
        description: 'Deploy to Vercel',
        parameters: {
          type: 'object',
          properties: { project: { type: 'string' } },
          required: ['project'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'netlify',
    category: 'DevOps',
    tools: [
      {
        name: 'netlify_deploy',
        description: 'Deploy to Netlify',
        parameters: {
          type: 'object',
          properties: { site: { type: 'string' } },
          required: ['site'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'cloudflare',
    category: 'DevOps',
    tools: [
      {
        name: 'cloudflare_purge_cache',
        description: 'Purge Cloudflare cache',
        parameters: {
          type: 'object',
          properties: { zone: { type: 'string' } },
          required: ['zone'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'heroku',
    category: 'DevOps',
    tools: [
      {
        name: 'heroku_deploy',
        description: 'Deploy to Heroku',
        parameters: { type: 'object', properties: { app: { type: 'string' } }, required: ['app'] },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'docker-hub',
    category: 'DevOps',
    tools: [
      {
        name: 'docker_push',
        description: 'Push Docker image',
        parameters: {
          type: 'object',
          properties: { image: { type: 'string' } },
          required: ['image'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'kubernetes',
    category: 'DevOps',
    tools: [
      {
        name: 'kubectl_apply',
        description: 'Apply Kubernetes manifest',
        parameters: {
          type: 'object',
          properties: { manifest: { type: 'string' }, namespace: { type: 'string' } },
          required: ['manifest'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'pagerduty',
    category: 'Analytics',
    tools: [
      {
        name: 'pagerduty_incident',
        description: 'Trigger PagerDuty incident',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            urgency: { type: 'string', enum: ['high', 'low'] },
          },
          required: ['title'],
        },
        requiresApproval: true,
      },
    ],
  },
  {
    app: 'opsgenie',
    category: 'Analytics',
    tools: [
      {
        name: 'opsgenie_alert',
        description: 'Create Opsgenie alert',
        parameters: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    ],
  },
  {
    app: 'mixpanel',
    category: 'Analytics',
    tools: [
      {
        name: 'mixpanel_track',
        description: 'Track Mixpanel event',
        parameters: {
          type: 'object',
          properties: { event: { type: 'string' }, props: { type: 'object' } },
          required: ['event'],
        },
      },
    ],
  },
  {
    app: 'amplitude',
    category: 'Analytics',
    tools: [
      {
        name: 'amplitude_track',
        description: 'Track Amplitude event',
        parameters: {
          type: 'object',
          properties: { event: { type: 'string' }, props: { type: 'object' } },
          required: ['event'],
        },
      },
    ],
  },
  {
    app: 'segment',
    category: 'Analytics',
    tools: [
      {
        name: 'segment_track',
        description: 'Track Segment event',
        parameters: {
          type: 'object',
          properties: { event: { type: 'string' }, props: { type: 'object' } },
          required: ['event'],
        },
      },
    ],
  },
  {
    app: 'posthog',
    category: 'Analytics',
    tools: [
      {
        name: 'posthog_capture',
        description: 'Capture PostHog event',
        parameters: {
          type: 'object',
          properties: { event: { type: 'string' }, props: { type: 'object' } },
          required: ['event'],
        },
      },
    ],
  },
  {
    app: 'openai',
    category: 'AI',
    tools: [
      {
        name: 'openai_image_generate',
        description: 'Generate image via DALL-E',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            size: {
              type: 'string',
              enum: ['256x256', '512x512', '1024x1024'],
              default: '1024x1024',
            },
          },
          required: ['prompt'],
        },
        rateLimit: 5,
      },
      {
        name: 'openai_transcribe',
        description: 'Transcribe audio file',
        parameters: {
          type: 'object',
          properties: { file: { type: 'string' } },
          required: ['file'],
        },
      },
    ],
  },
  {
    app: 'anthropic',
    category: 'AI',
    tools: [
      {
        name: 'anthropic_complete',
        description: 'Run Claude completion',
        parameters: {
          type: 'object',
          properties: { prompt: { type: 'string' }, maxTokens: { type: 'number', default: 1024 } },
          required: ['prompt'],
        },
      },
    ],
  },
  {
    app: 'supabase',
    category: 'DevOps',
    tools: [
      {
        name: 'supabase_query',
        description: 'Run Postgres query via Supabase',
        parameters: {
          type: 'object',
          properties: { table: { type: 'string' }, filter: { type: 'object' } },
          required: ['table'],
        },
      },
      {
        name: 'supabase_insert',
        description: 'Insert row to Supabase table',
        parameters: {
          type: 'object',
          properties: { table: { type: 'string' }, row: { type: 'object' } },
          required: ['table', 'row'],
        },
      },
    ],
  },
];

/** Handler mac dinh cho catalog tools: tra JSON status, khong throw */
function makeCatalogHandler(app: string, name: string) {
  return async (args: Record<string, unknown>) => {
    return JSON.stringify(
      {
        status: 'requires_integration',
        app,
        tool: name,
        args,
        message: `Tool "${name}" cho app "${app}" can wire vao adapter tuong ung. See composioAdapter.ts de biet credential setup.`,
      },
      null,
      2,
    );
  };
}

/** Register toan bo TOOL_CATALOG vao registry (~150+ tools) */
export function loadComposioCatalog(registry: ToolRegistry): number {
  const defs: ToolDefinition[] = [];
  for (const group of TOOL_CATALOG) {
    for (const t of group.tools) {
      defs.push({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        execute: makeCatalogHandler(group.app, t.name),
        tags: [`saas:${group.app}`, group.category.toLowerCase().replace(/[^a-z0-9]/g, '-')],
        source: `composio:${group.app}` as ToolSource,
        version: t.version ?? '1.0.0',
        rateLimit: t.rateLimit,
        requiresApproval: t.requiresApproval,
      });
    }
  }
  registry.registerMany(defs);
  return defs.length;
}
