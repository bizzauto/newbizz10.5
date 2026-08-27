# Automation Inventory — BIZZ CRM

Every automated process in the platform: trigger, owning workflow (n8n JSON or BullMQ worker), schedule, and service entrypoint.

## Trigger → Process map

| Process | Trigger | n8n workflow / BullMQ queue | Schedule | Code entrypoint |
|---------|---------|------------------------------|----------|-----------------|
| Lead capture + enrich | Webhook `POST /lead-capture` | `n8n-workflows/lead-capture.json` | event | `routes/automation.ts`, `services/lead-capture.service.ts` |
| Lead processing (assign/score/notify) | Queue job | `lead-processing` (BullMQ) | event | `workers/index.ts#leadProcessingWorker` |
| IndiaMART enquiry autosync | Poller (5 min) | `indiamartAutosyncTick` | every 5 min | `services/indiamart-sync.service.ts`, `worker.ts` |
| Deal stage change → notify/proposal | Webhook `POST /deal-stage-change` | `n8n-workflows/deal-stage-change.json` | event | `routes/automation.ts` |
| WhatsApp send (bulk/scheduled) | Queue job / schedule | `whatsapp-messages` (BullMQ) | event + cron | `workers/index.ts#whatsappWorker`, `scheduled-message.worker.ts` |
| Scheduled messages | DB `scheduledMessage` | `whatsapp-messages` (job `scheduled-message`) | per `scheduledAt` | `workers/index.ts`, `scheduled-message.worker.ts` |
| Email send | Queue job | `emails` (BullMQ) | event | `workers/index.ts#emailWorker`, `services/email.service.ts` |
| Campaign dispatch | DB `campaign.scheduledAt` | `campaign-scheduler` (repeat 60s) | every 1 min | `workers/index.ts#campaignSchedulerWorker`, `startCampaignDispatcher` |
| Social post publish | DB `post.scheduledAt` | `social-publish` (repeat 60s) | every 1 min | `workers/index.ts#socialPublishWorker`, `startSocialDispatcher` |
| GBP auto-post | DB flag `gbpAutoPostEnabled` | `gbp-auto-post` (BullMQ) + `gbp-auto-post.json` | event/cron | `workers/index.ts#gbpAutoPostWorker`, `gbp-auto-post.worker.ts` |
| Google Sheets sync | Queue job | `google-sheets-sync` (BullMQ) | event | `workers/index.ts#googleSheetsSyncWorker` |
| Webhook delivery + retry | Outbound HTTP | `webhookRetry` (BullMQ) | event | `services/webhook-retry.service.ts` |
| Support ticket triage | Webhook `POST /support-ticket` | `n8n-workflows/support-triage.json` | event | `routes/automation.ts` |
| Invoice reminder + late fee | Schedule (cron `0 8 * * *`) | `n8n-workflows/invoice-reminder.json` | daily 08:00 | n8n |
| AI daily KPI report | Schedule (cron `0 7 * * *`) | `n8n-workflows/ai-daily-report.json` | daily 07:00 | n8n |
| HR onboarding | Webhook `POST /hr-onboarding` | `n8n-workflows/hr-onboarding.json` | event | n8n |
| Finance reconciliation | Webhook `POST /finance-reconcile` | `n8n-workflows/finance-reconciliation.json` | event | n8n |
| Ops ticket dispatch | Webhook `POST /ops-dispatch` | `n8n-workflows/ops-ticket-dispatch.json` | event | n8n |
| Deal automation (WF-010) | Webhook/event | `n8n-workflows/WF-010-deal-automation.json` | event | n8n |
| Email automation (WF-011) | Webhook/event | `n8n-workflows/WF-011-email-automation.json` | event | n8n |
| Review management (WF-012) | Webhook/event | `n8n-workflows/WF-012-review-management.json` | event | n8n |
| Social publishing (WF-013) | Webhook/event | `n8n-workflows/WF-013-social-publishing.json` | event | n8n |
| Domain events fan-out | Redis stream `bizz:events` | `eventBus.ts` emit | event | `events/eventBus.ts` |
| Follow-up / nurture engine | `scheduledMessage` + campaign | app + n8n | cron | `campaigns.ts`, `automation.ts` |

## Notes
- BullMQ workers run in the separate `worker.ts` process. Redis-down → all queues **disabled**, app still serves API (`workers/index.ts`).
- n8n workflows are templates; they must be imported + activated in the self-hosted instance (`n8n-workflows/README.md`).
- Repeatable dispatchers (`campaign-scheduler`, `social-publish`) scan the DB every 60s with idempotent `jobId` (`workers/index.ts`).
