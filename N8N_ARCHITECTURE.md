# N8N Architecture — BIZZ CRM

n8n is the **cross-system automation layer** for BIZZ CRM. The app owns CRM data + queues; n8n owns enrichment, notifications, and third-party orchestration.

## Integration model
- **Client:** `src/server/services/n8n.service.ts` (axios). Base URL `N8N_BASE_URL`, key `N8N_API_KEY`. Header `X-N8N-API-KEY`.
- **Routes:** `src/server/routes/n8n.ts` proxies list/get/execute; `routes/automation.ts` emits CRM events that n8n consumes.
- **Auth (service→n8n):** the app authenticates to n8n with the API key.
- **Auth (n8n→app):** `middleware/auth.ts#authenticateViaN8nApiKey`:
  1. `x-n8n-api-key` timing-safe compare against `N8N_API_KEY`.
  2. `x-business-id` + `x-business-signature` = HMAC-SHA256(`N8N_API_KEY`, businessId). **Prevents tenant breakout** — a forged businessId without the correct HMAC is rejected (403).
  3. On success, injects system user `{ id:'n8n-automation', role:'ADMIN', isServiceAccount:true, businessId }`.

## Workflow library
13 templates in `src/server/n8n-workflows/` (see `WORKFLOW_TEMPLATES.md`): lead-capture, deal-stage-change, gbp-auto-post, support-triage, invoice-reminder, ai-daily-report, hr-onboarding, finance-reconciliation, ops-ticket-dispatch, WF-010..WF-013.

## Execution modes
| Mode | Trigger | Example |
|------|---------|---------|
| Webhook | `POST /<path>` from CRM or external | lead-capture, support-ticket |
| Schedule | cron in workflow JSON | gbp-auto-post `0 9 * * *`, invoice-reminder `0 8 * * *`, ai-daily-report `0 7 * * *` |
| Event stream | consume Redis `bizz:events` | custom consumers |

## Credential handling
- n8n credential vault stores: HTTP Header Auth (Clearbit, WhatsApp Cloud, FCM, CRM, Helpdesk, Billing, Slack), OAuth2 (Google My Business, Google Sheets).
- **Never** commit `N8N_API_KEY` or any credential in the JSON templates.
- CRM access from n8n uses the service key + HMAC (not a user JWT).
- App-side secrets (WhatsApp/GBP/social) are AES-256-GCM encrypted at rest (`utils/encryption.ts`).

## Event flow (CRM → n8n)
```
CRM route → emitEvent(type, payload)            events/eventBus.ts
        ├─► Redis stream  bizz:events   ──────► n8n consumer (webhook/stream)
        └─► DomainEvent row (audit)              (or n8n calls back POST /api/*)
n8n → POST /api/leads (x-n8n-api-key + HMAC) ──► CRM writes (business-scoped)
```

## Failure handling
- n8n calls to CRM that fail auth are rejected (401/403) — no tenant cross-talk.
- CRM `emitEvent` is best-effort (never throws to caller); if Redis down, only the `DomainEvent` persist attempt remains (`events/eventBus.ts`).
- n8n-side retries are configured per workflow node.

## Operational notes
- Import is **manual** today (Settings → Import from File). Automated sync from repo is a roadmap item.
- `isN8nConfigured()` gates features; `/api/metrics` reports `n8nConfigured`.
- Rotate `N8N_API_KEY` by updating Coolify secret + n8n instance; HMAC uses the same key.
