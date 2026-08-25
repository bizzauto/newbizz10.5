# Automation

BizzAuto's automation layer has two parts today: **BullMQ background workers** (code) and a **DB-driven trigger/condition/action engine** (data). The roadmap surfaces both as editable **n8n workflows** (see `N8N_ARCHITECTURE.md`, `WORKFLOW_TEMPLATES.md`).

## BullMQ Workers (code)

Entry point: `src/server/workers/index.ts` (run via `npm run worker`). Queues are created only if Redis is reachable (`redisAvailable` gate). Defaults: 3 attempts, exponential backoff 5s, keep completed 1d/1000, keep failed 7d/5000.

| Queue (BullMQ name) | Worker file | What it does |
|---------------------|-------------|--------------|
| `whatsapp-messages` | `workers/index.ts` | Sends WhatsApp text/template/media via `WhatsAppSendRouter`; also processes `scheduled-message` jobs. Concurrency 10. |
| `emails` | `workers/index.ts` | `EmailService.sendEmail`. Concurrency 5. |
| `social-publish` | `workers/index.ts` | Publishes `Post` rows to FB/IG/LinkedIn/Twitter/GBP; a `dispatch-due-posts` repeatable tick (every 60s) enqueues due posts. Concurrency 5. |
| `google-sheets-sync` | `workers/index.ts` | `GoogleSheetsService.syncContacts` / `importContacts`. |
| `lead-processing` | `workers/index.ts` | Runs `LeadCaptureService` per source (indiamart, justdial, facebook_ads, instagram_ads, generic), auto-assigns rep (round-robin), creates notifications, computes `LeadScore`. |
| `campaign-scheduler` | `workers/index.ts` | `dispatch-due-campaigns` repeatable tick (60s) enqueues due `Campaign`s → fans out template messages to target contacts. |
| `gbp-auto-post` | `workers/index.ts` **and** `workers/gbp-auto-post.worker.ts` | Checks businesses with `gbpAutoPostEnabled` and posts to Google Business Profile via `GBPAutoPostService`. Repeatable every 60s. |
| `scheduled-messages` | `workers/scheduled-message.worker.ts` | Sends `ScheduledMessage` rows; respects `WhatsAppRateLimiter`, re-queues on rate limit; concurrency 1. |
| `outreach` | `workers/outreach.worker.ts` | Outreach/sequenced messaging worker. |
| `webhook-retry` | `services/webhook-retry.service.ts` | Retries failed outbound webhook deliveries (with SSRF-safe URL checks). |

> Note: `gbp-auto-post` is registered by both `workers/index.ts` and `workers/gbp-auto-post.worker.ts` (two definitions of the same queue — consolidate during the n8n migration).

Campaign + social dispatchers are started by `startCampaignDispatcher()` / `startSocialDispatcher()` (idempotent via stable `jobId`). `shutdownAllWorkers()` closes everything on SIGTERM/SIGINT.

## DB-Driven Trigger/Condition/Action Engine (data)

`routes/automation.ts` (mounted `/api/automation`) is the API for the engine. Two Prisma models back it:

- **`AutomationRule`** (`businessId`, `name`, `description`, `isActive`, `trigger Json`, `actions Json[]`, `runCount`, `lastRunAt`). CRUD: `GET/POST /api/automation/automations`, `PUT/DELETE /api/automation/automations/:id`, `POST /api/automation/automations/:id/toggle`.
- **`ChatbotFlow`** (`businessId`, `name`, `trigger`, `keywords`, `response`, `aiEnabled`, `isActive`) — legacy "auto-reply rule" model, also managed here (`/api/automation/rules`, `/templates`).
- **`Workflow`** (`businessId`, `name`, `triggerType`, `triggerConfig`, `nodes Json`, `edges Json`, `isActive`, `createdBy`) — the visual node/edge graph model. Created from templates via `POST /api/automation/deploy-template` (persists a `Workflow` + logs a `workflow_deployed` activity).

Engine semantics:
- A trigger (`lead_created`, `message_received`, `stage_changed`, `payment_due`, `cart_abandoned`, `birthday_today`, …) fires the `actions` array (send WhatsApp/email, add tag, notify team, wait, create activity).
- `nodes`/`edges` use a React-Flow shape (`@xyflow/react`); `services/workflow/condition.evaluator.ts` + `services/workflow/handlers/registry.ts` + `services/workflow/interpolate.ts` evaluate conditions and interpolate `{{variables}}`.
- `DEPLOYABLE_TEMPLATES` (in `routes/automation.ts`) are the built-in catalog: `leadgen-whatsapp-reply`, `leadgen-ai-reply`, `incoming-msg-autoreply`, `leadgen-full-funnel`. `GET /api/automation/deploy-templates` lists them.

## Plan: Surface as Editable n8n Workflows

1. Port each `DEPLOYABLE_TEMPLATES` entry to n8n JSON in `src/server/n8n-workflows/` (see `WORKFLOW_TEMPLATES.md`).
2. On deploy, push the template to n8n (`POST {N8N_URL}/api/v1/workflows`) and store the n8n `workflowId` on the `Workflow` row.
3. Triggering flows through the `DomainEvent` → `bizz:events` Redis stream (planned) so n8n owns execution; BullMQ workers are retired per-domain.

See `N8N_ARCHITECTURE.md`, `WORKFLOW_TEMPLATES.md`.
