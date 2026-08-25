# BizzAuto n8n Workflows

Automation workflows for the BizzAuto platform, designed to be imported into a self-hosted
or cloud [n8n](https://n8n.io) instance.

## Files

| File | Workflow Name | Trigger Type |
|------|---------------|--------------|
| `lead-capture.json` | Lead Capture & Enrich | Webhook (`POST /lead-capture`) |
| `deal-stage-change.json` | Deal Stage Change | Webhook (`POST /deal-stage-change`) |
| `gbp-auto-post.json` | Google Business Profile Auto-Post | Schedule (cron `0 9 * * *`) |
| `support-triage.json` | Support Ticket Triage | Webhook (`POST /support-ticket`) |
| `invoice-reminder.json` | Invoice Reminder & Late Fee | Schedule (cron `0 8 * * *`) |
| `ai-daily-report.json` | AI Daily KPI Report | Schedule (cron `0 7 * * *`) |
| `hr-onboarding.json` | HR — Employee Onboarding | Webhook (`POST /hr-onboarding`) |
| `finance-reconciliation.json` | Finance — Invoice Reconciliation | Webhook (`POST /finance-reconcile`) |
| `ops-ticket-dispatch.json` | Ops — Ticket Dispatch | Webhook (`POST /ops-dispatch`) |

## Workflow Descriptions

### 1. Lead Capture & Enrich (`lead-capture.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Captures an inbound lead -> enriches it via Clearbit -> maps fields with a Set
  node -> creates a contact in the CRM via `POST /api/leads` -> sends a welcome WhatsApp
  message -> enrolls the lead into the `new_lead_14d` nurture sequence.
- **Credentials needed:** HTTP Header Auth (Clearbit, WhatsApp Business, CRM).

### 2. Deal Stage Change (`deal-stage-change.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Receives a deal event -> IF node checks for `won` or `proposal_sent` -> notifies
  the deal owner via FCM push -> logs a CRM activity -> generates a proposal through the AI
  endpoint `POST /api/ai/generate-proposal`.
- **Credentials needed:** HTTP Header Auth (FCM, CRM).

### 3. Google Business Profile Auto-Post (`gbp-auto-post.json`)
- **Trigger:** Schedule (daily at 09:00).
- **Flow:** Triggers on schedule -> a Set node holds the post copy -> publishes a Local Post
  to Google Business Profile via the My Business API.
- **Credentials needed:** Google My Business OAuth2.

### 4. Support Ticket Triage (`support-triage.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Receives a ticket -> a Code node classifies priority (high/medium/low) using
  keyword heuristics -> IF routes high-priority tickets -> a Set node sets an SLA timer
  (1 hour) -> escalates the ticket to Tier 2 via `POST /api/tickets/escalate`.
- **Credentials needed:** HTTP Header Auth (Helpdesk).

### 5. Invoice Reminder & Late Fee (`invoice-reminder.json`)
- **Trigger:** Schedule (daily at 08:00).
- **Flow:** Fetches unpaid/due invoices -> `splitInBatches` loops per invoice -> IF checks
  overdue status -> sends a reminder email -> a second IF applies a late fee when
  `days_overdue > 7`.
- **Credentials needed:** HTTP Header Auth (Billing).

### 6. AI Daily KPI Report (`ai-daily-report.json`)
- **Trigger:** Schedule (daily at 07:00).
- **Flow:** Aggregates daily KPIs from `GET /api/reports/daily` -> a Code node builds a
  prompt -> calls the AI endpoint `POST /api/ai/summarize` -> sends the digest to Slack.
- **Credentials needed:** HTTP Header Auth (CRM, Slack).

### 7. HR — Employee Onboarding (`hr-onboarding.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Receives a new hire -> sends a Day-1 welcome email -> creates an onboarding task in
  the CRM -> notifies the HR team via WhatsApp.
- **Credentials needed:** HTTP Header Auth (CRM, WhatsApp Business).

### 8. Finance — Invoice Reconciliation (`finance-reconciliation.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Fetches paid invoices -> tallies a daily count -> posts a reconciliation summary to
  the finance WhatsApp channel.
- **Credentials needed:** HTTP Header Auth (CRM, WhatsApp Business).

### 9. Ops — Ticket Dispatch (`ops-ticket-dispatch.json`)
- **Trigger:** Webhook (POST).
- **Flow:** Receives an ops issue -> creates a ticket -> assigns the on-call engineer -> notifies
  on-call via WhatsApp.
- **Credentials needed:** HTTP Header Auth (CRM, WhatsApp Business).

## How to Import

### Option A — Import from File (recommended)
1. Open your n8n instance.
2. Go to **Settings** (gear icon, bottom-left) -> **Import from File**.
3. Select one of the `.json` files above.
4. Click **Import**. The workflow will appear on your canvas.
5. Configure credentials (HTTP Header Auth / OAuth2) and activate the workflow.

### Option B — Paste JSON
1. In n8n, click **+** -> **Import from URL/File**, or open an existing workflow and choose
   **Import from File**.
2. Alternatively, copy the contents of any `.json` file and paste it directly when creating a
   workflow from a JSON template (Workflows -> **New** -> **Import from File**).
3. Save and **Activate** the workflow.

> Tip: Webhook-triggered workflows expose a production URL under the node once activated.
> Schedule-triggered workflows run automatically per the embedded cron expression.

## Environment Variables
Some workflows reference env vars (e.g. `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`). Define these in
the n8n instance under **Settings -> Environment** or in your n8n `.env` / docker-compose file.
