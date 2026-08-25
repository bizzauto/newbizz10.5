# N8N Architecture

How BizzAuto integrates with **n8n** for visual workflow automation. The app is both an **n8n client** (triggers/fetches workflows) and an **n8n target** (exposes endpoints n8n calls back).

> **Current state vs plan.** Several pieces described here as "planned" do not yet exist as dedicated modules:
> - The task brief referenced `src/server/events/eventBus.ts` publishing to a Redis stream `bizz:events`. The **real** event bus is `src/server/services/event-bus.service.ts` and it currently persists events to the `DomainEvent` table and runs **in-process** handlers — there is **no Redis stream yet**.
> - The brief referenced `src/server/services/n8n.service.ts` and `src/server/routes/n8n.ts`. In the repo the n8n client logic is **inline in `src/server/routes/automation.ts`** (mounted at `/api/automation`), with additional triggers in `routes/ava.ts` and `services/lead-capture.service.ts`.
> - The brief referenced `src/server/routes/inbound-webhooks.ts`. The repo has `routes/webhooks.ts` (outbound webhook CRUD) and a signature-verified inbound route at `/api/webhooks/meta-leads`; a dedicated inbound-webhooks ingress is a planned refactor.

## Configuration (env vars)

| Var | Purpose |
|-----|---------|
| `N8N_URL` | Base URL of the n8n instance (default `http://localhost:5678`). Used by app→n8n calls. |
| `N8N_APP_API_KEY` | App→n8n REST auth (`X-N8N-API-KEY` header, e.g. `GET /api/v1/workflows`). Falls back to `N8N_API_KEY`. |
| `N8N_API_KEY` | n8n→app auth: n8n workflows send `x-n8n-api-key` header; verified in `middleware/auth.ts#authenticateViaN8nApiKey` (HMAC-signed `x-business-signature` + `x-business-id` to prevent tenant breakout). |
| `N8N_PASSWORD`, `N8N_ENCRYPTION_KEY`, `N8N_USER_MANAGEMENT_JWT_SECRET`, `N8N_HOST`, `N8N_PROTOCOL` | n8n instance provisioning (see `.env.example`). |

SSL verification is skipped only when `N8N_URL` points to a private/internal host (`getN8nHttpsAgent()` in `routes/automation.ts`).

## The Event Bus (current)

`src/server/services/event-bus.service.ts`:
- `emitEvent(eventType, payload, { businessId, idempotencyKey })` → writes a `DomainEvent` row (idempotent on `idempotencyKey` unique constraint), then runs registered handlers sequentially. A handler failure marks the event `partial_error` but never blocks others.
- `registerEventHandler(eventType, handler)` attaches subscribers (e.g. `meta-leads.service.ts` calls `emitEvent('lead.created', …)`).
- **Planned:** add a Redis Stream `bizz:events` (`XADD`) so n8n (or other consumers) can subscribe to domain events as a durable, replayable feed, in addition to the `DomainEvent` table.

## App → n8n (admin routes, mounted at `/api/automation`)

Implemented in `routes/automation.ts` (all require `authenticate`):

| Method & Path | Purpose |
|---------------|---------|
| `GET /api/automation/n8n/status` | Health-check n8n (`GET {N8N_URL}/healthz`). |
| `POST /api/automation/n8n/trigger/:workflowId` | Forward a webhook to `{N8N_URL}/webhook/:workflowId`. |
| `GET /api/automation/n8n/workflows` | List workflows via n8n REST `GET {N8N_URL}/api/v1/workflows` (with `X-N8N-API-KEY`). |
| `POST /api/automation/n8n/workflows/:workflowId/trigger` | Alternative trigger endpoint. |

Other n8n triggers:
- `routes/ava.ts`: `GET /api/ava/n8n/status` and `POST /api/ava/n8n/trigger` (Ava AI assistant fires n8n webhooks).
- `services/lead-capture.service.ts`: when an automation rule has `n8nWorkflowId`, it `POST`s the lead payload to `{N8N_URL}/webhook/{n8nWorkflowId}`.

## n8n → App (inbound ingress)

- `middleware/auth.ts#authenticateViaN8nApiKey` lets n8n call protected app endpoints: it validates `x-n8n-api-key`, verifies an HMAC `x-business-signature` over the body, and injects a system user (`id: 'n8n-automation'`) scoped to `x-business-id`. This prevents cross-tenant access.
- **Planned** `src/server/routes/inbound-webhooks.ts` (at `/api/inbound-webhooks`) would normalize external events (lead forms, payment webhooks, review events) into `emitEvent(...)` calls, so an n8n workflow can subscribe to a single canonical event feed.

## Planned Migration of BullMQ Workers → n8n

The background workers in `workers/index.ts` (whatsapp-messages, emails, social-publish, google-sheets-sync, lead-processing, campaign-scheduler, gbp-auto-post) are candidates to move into n8n:
- Each worker's job becomes an n8n workflow triggered by a `DomainEvent` on the `bizz:events` stream.
- Benefits: visual editing, easier retry/branch logic, non-engineer automation building.
- The DB-driven `AutomationRule` / `Workflow` engine (`AUTOMATION.md`) is the bridge: deployable templates in `routes/automation.ts` (`DEPLOYABLE_TEMPLATES`) will be the seed for equivalent n8n workflow JSON (see `WORKFLOW_TEMPLATES.md`).
- Redis stays required for BullMQ until the cutover is complete; workers degrade gracefully when Redis is absent.

See `AUTOMATION.md`, `WORKFLOW_TEMPLATES.md`, `MONITORING.md`.
