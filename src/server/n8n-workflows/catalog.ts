export interface WorkflowTemplate {
  id: string;
  file: string;
  name: string;
  description: string;
  trigger: string;
  category: string;
}

export const WORKFLOW_CATALOG: WorkflowTemplate[] = [
  {
    id: 'WF-010',
    file: 'WF-010-deal-automation.json',
    name: 'Deal Stage Automation',
    description: 'Triggers when a deal changes stage, maps the deal fields, and notifies the BIZZ API.',
    trigger: 'deal.stage_changed webhook',
    category: 'Sales',
  },
  {
    id: 'WF-011',
    file: 'WF-011-email-automation.json',
    name: 'Email Automation',
    description: 'On a daily schedule, fetches leads and sends them an email via /api/email.',
    trigger: 'cron (daily 08:00)',
    category: 'Marketing',
  },
  {
    id: 'WF-012',
    file: 'WF-012-review-management.json',
    name: 'Review Management',
    description: 'Receives a review, runs AI sentiment analysis, and creates a recovery task for negatives.',
    trigger: 'review.received webhook',
    category: 'Reputation',
  },
  {
    id: 'WF-013',
    file: 'WF-013-social-publishing.json',
    name: 'Social Publishing',
    description: 'Formats an incoming post and publishes it through the social API.',
    trigger: 'webhook',
    category: 'Social',
  },
  {
    id: 'WF-014',
    file: 'WF-014-ai-content-generator.json',
    name: 'AI Content Generator',
    description: 'Accepts a product and uses OpenAI to generate a caption and hashtags, then responds.',
    trigger: 'webhook (product)',
    category: 'AI',
  },
  {
    id: 'WF-015',
    file: 'WF-015-ai-poster-generator.json',
    name: 'AI Poster Generator',
    description: 'Accepts a prompt and generates an image via OpenAI, returning the image URL.',
    trigger: 'webhook',
    category: 'AI',
  },
  {
    id: 'WF-016',
    file: 'WF-016-campaign-automation.json',
    name: 'Campaign Automation',
    description: 'On a daily schedule, fetches the audience and sends a campaign.',
    trigger: 'cron (daily 10:00)',
    category: 'Marketing',
  },
  {
    id: 'WF-017',
    file: 'WF-017-daily-business-report.json',
    name: 'Daily Business Report',
    description: 'At 09:00, aggregates metrics, AI-summarizes them, and sends via WhatsApp/email.',
    trigger: 'cron (daily 09:00)',
    category: 'Reporting',
  },
  {
    id: 'WF-018',
    file: 'WF-018-ai-sales-assistant.json',
    name: 'AI Sales Assistant',
    description: 'Answers a sales question using CRM data via OpenAI and returns the answer.',
    trigger: 'webhook (question)',
    category: 'AI',
  },
  {
    id: 'WF-019',
    file: 'WF-019-churn-detection.json',
    name: 'Churn Detection',
    description: 'Weekly, fetches inactive customers, flags at-risk ones, and notifies the success team.',
    trigger: 'cron (weekly)',
    category: 'Retention',
  },
  {
    id: 'WF-020',
    file: 'WF-020-payment-handler.json',
    name: 'Payment Handler',
    description: 'On a payment event, verifies it server-side and updates the subscription.',
    trigger: 'payment webhook',
    category: 'Billing',
  },
  {
    id: 'WF-021',
    file: 'WF-021-failed-job-recovery.json',
    name: 'Failed Job Recovery',
    description: 'Hourly, lists failed jobs and retries them.',
    trigger: 'cron (hourly)',
    category: 'Operations',
  },
  {
    id: 'WF-022',
    file: 'WF-022-webhook-retry.json',
    name: 'Webhook Retry',
    description: 'Wraps an inbound webhook with up to 3 retry attempts before forwarding.',
    trigger: 'webhook',
    category: 'Operations',
  },
  {
    id: 'WF-023',
    file: 'WF-023-ai-cost-controller.json',
    name: 'AI Cost Controller',
    description: 'Daily, fetches AI usage and alerts if spend is over the configured budget.',
    trigger: 'cron (daily 06:00)',
    category: 'AI',
  },
  {
    id: 'WF-024',
    file: 'WF-024-error-handler.json',
    name: 'Error Handler',
    description: 'Receives an error event, classifies it, and notifies the admin.',
    trigger: 'error event webhook',
    category: 'Operations',
  },
  {
    id: 'WF-025',
    file: 'WF-025-admin-alert.json',
    name: 'Admin Alert',
    description: 'Receives a critical event and sends an admin notification via the BIZZ API.',
    trigger: 'critical webhook',
    category: 'Operations',
  },
];
