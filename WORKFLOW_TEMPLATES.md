# Workflow Templates — BIZZ CRM n8n Library

Templates live in `src/server/n8n-workflows/`. Import into a self-hosted n8n instance (see `n8n-workflows/README.md`). The app talks to n8n via `services/n8n.service.ts` (`X-N8N-API-KEY`) and `routes/n8n.ts`.

| File | Workflow name | Trigger | Purpose |
|------|---------------|---------|---------|
| `lead-capture.json` | Lead Capture & Enrich | Webhook `POST /lead-capture` | Capture inbound lead → enrich → create Contact via `POST /api/leads` → welcome WhatsApp → enroll `new_lead_14d` nurture. |
| `deal-stage-change.json` | Deal Stage Change | Webhook `POST /deal-stage-change` | On `won`/`proposal_sent` → FCM push to owner → log Activity → generate proposal via `POST /api/ai/generate-proposal`. |
| `gbp-auto-post.json` | Google Business Profile Auto-Post | Schedule `0 9 * * *` | Publish a Local Post to GBP via My Business API for businesses with `gbpAutoPostEnabled`. |
| `support-triage.json` | Support Ticket Triage | Webhook `POST /support-ticket` | Classify priority (high/med/low) → set SLA timer → escalate high to Tier 2 via `POST /api/tickets/escalate`. |
| `invoice-reminder.json` | Invoice Reminder & Late Fee | Schedule `0 8 * * *` | Fetch unpaid/due invoices → remind email → apply late fee when `days_overdue > 7`. |
| `ai-daily-report.json` | AI Daily KPI Report | Schedule `0 7 * * *` | Aggregate `GET /api/reports/daily` → build prompt → `POST /api/ai/summarize` → post digest to Slack. |
| `hr-onboarding.json` | HR — Employee Onboarding | Webhook `POST /hr-onboarding` | Day-1 welcome email → create onboarding task in CRM → notify HR via WhatsApp. |
| `finance-reconciliation.json` | Finance — Invoice Reconciliation | Webhook `POST /finance-reconcile` | Tally paid invoices → post reconciliation summary to finance WhatsApp. |
| `ops-ticket-dispatch.json` | Ops — Ticket Dispatch | Webhook `POST /ops-dispatch` | Create ticket → assign on-call → notify on-call via WhatsApp. |
| `WF-010-deal-automation.json` | Deal Automation | Webhook/event | Automated deal-stage transitions + notifications. |
| `WF-011-email-automation.json` | Email Automation | Webhook/event | Trigger/sequence email sends from CRM events. |
| `WF-012-review-management.json` | Review Management | Webhook/event | Request/review collection + response drafting. |
| `WF-013-social-publishing.json` | Social Publishing | Webhook/event | Cross-post to connected social accounts. |

## Credentials required (per workflow)
- HTTP Header Auth: Clearbit, WhatsApp Business (Cloud API), CRM (`x-n8n-api-key` + HMAC), FCM, Helpdesk, Billing, Slack.
- OAuth2: Google My Business (GBP), Google (Sheets).
- Secrets must be stored in n8n credential vault, **not** in the JSON. Never commit `N8N_API_KEY`.

## Import (recommended)
Settings → Import from File → select JSON → Activate. Webhook workflows expose a production URL once active; schedule workflows run per embedded cron.

## Note
These are **templates**. Production wiring requires: (a) n8n instance reachable at `N8N_BASE_URL`, (b) `N8N_API_KEY` set, (c) workflows activated, (d) app calling them via `routes/automation.ts` emit + `emitEvent` (`events/eventBus.ts`). Automated import/sync is a roadmap item (`AUTOMATION.md`).
