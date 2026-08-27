# API — BIZZ CRM

REST API served by `src/server/index.ts` (Express 4). Most groups mounted under `/api` with `apiVersioning` middleware. All state-changing routes require auth + CSRF.

## Auth model
- **User auth:** `Authorization: Bearer <jwt>` (JWT from `utils/jwtConfig.ts`). Verified in `middleware/auth.ts#authenticate`. Roles: `SUPER_ADMIN, OWNER, ADMIN, MANAGER, SALES_REP, STAFF`.
- **n8n service auth:** header `x-n8n-api-key` (timing-safe compare) + HMAC `x-business-signature` over `x-business-id` (tenant-breakout defense). See `middleware/auth.ts#authenticateViaN8nApiKey`, `services/n8n.service.ts`.
- **Webhook auth:** `x-webhook-secret` (constant-time compare) for lead capture; per-business `leadWebhookSecret` (+ optional global `LEAD_WEBHOOK_SECRET`).
- **CSRF:** `X-CSRF-Token` double-submit on mutating routes; issued at login / `/auth/me`.
- **Rate limits:** global 100/15m (IP+business), AI 50/15m, upload 20/15m (`SECURITY.md`).

## Key groups

### /api/automation/*
Trigger automation + emit domain events. Backs n8n webhooks (`lead-capture`, `deal-stage-change`, `support-ticket`, `hr-onboarding`, `finance-reconcile`, `ops-dispatch`). Source: `routes/automation.ts`, `events/eventBus.ts`.

### /api/n8n
n8n management proxy. Lists/gets/executes workflows via `services/n8n.service.ts` (`X-N8N-API-KEY`). Source: `routes/n8n.ts`. Endpoints mirror n8n v1: `GET /workflows`, `GET /workflows/:id`, `POST /workflows/:id/execute`, webhook trigger.

### /api/workflows
In-app automation builder (conditions, actions, sequences). Source: `routes/workflows.ts`, `services/workflow/*`. Distinct from n8n import.

### /api/ai
AI gateway + agents. `POST /api/ai/summarize`, `/generate-proposal`, plus `routes/ai.ts`, `routes/ai-sales-agent.ts`, `routes/ava.ts`, `routes/intelligence.ts`. Calls `ai-gateway.service.ts` (provider chain + `AiUsageLog`). Rate-limited `aiApiRateLimiter`.

### /api/whatsapp
WhatsApp messaging (Evolution + Cloud API routers). `routes/whatsapp.ts`, `whatsapp-send-router.service.ts`, `evolution.service.ts`. Send text/template/media, webhooks (signature-verified), rate-limited (`whatsapp-rate-limit.ts`).

### /api/leads
Lead/contact capture + CRUD. `routes/leads.ts`, `routes/contacts.ts`. Webhook capture via `validateWebhook`. Auto-assign/score in `lead-processing` worker.

### /api/campaigns
Campaign CRUD + dispatch. `routes/campaigns.ts`. Scheduled campaigns picked by `campaign-scheduler` BullMQ worker (repeat 60s).

### /api/admin
Platform/tenant ops. `routes/super-admin.ts`, `admin-queues.ts`, `admin-analytics.ts`, `admin-infrastructure.ts`. `SUPER_ADMIN` only. Queue inspection, infra status, analytics.

## Other notable groups
`/api/auth` (JWT/OAuth/Apple/SSO), `/api/deals`, `/api/pipelines`, `/api/crm-invoices`, `/api/reports`, `/api/metrics` (OWNER/ADMIN), `/api/health|/live|/ready` (no auth), `/api/social-*`, `/api/email`, `/api/razorpay-*`, `/api/subscriptions`, `/api/webhooks` (inbound, signature-verified).

## Conventions
- Responses shaped by `utils/response.ts` (`{ success, data, error }`).
- Errors centralized in `utils/error.ts`.
- All privileged actions audited (`auditMiddleware` → `AuditLog`/`Activity`).
- Versioning: `routes/v2/*` for the next API generation.
