# Workflow Templates (n8n)

Index of n8n workflow JSON templates that **will live in `src/server/n8n-workflows/`** (planned). These mirror the in-app `DEPLOYABLE_TEMPLATES` catalog in `routes/automation.ts` and the `AutomationRule` actions. Each file is a standard n8n workflow export (`nodes`, `connections`, `settings`) plus a small BizzAuto metadata header.

> Today the canonical templates are defined **in code** at `routes/automation.ts` (`DEPLOYABLE_TEMPLATES`): `leadgen-whatsapp-reply`, `leadgen-ai-reply`, `incoming-msg-autoreply`, `leadgen-full-funnel`. The files below are the target n8n JSON form. The `automation.templates` list (`GET /api/automation/automations/templates`) also documents 8 business templates (welcome, lead capture, review request, CRM stage move, email drip, abandoned cart, payment reminder, birthday).

## Planned template files

| File | Trigger | What it does |
|------|---------|--------------|
| `lead-capture.json` | `lead.created` (DomainEvent) | On new lead: send personalized WhatsApp welcome (`send_whatsapp`), add `Auto-Replied` tag, wait 30m, send follow-up. Mirrors `leadgen-whatsapp-reply`. |
| `deal-stage-change.json` | `stage_changed` | When a `Deal`/`Contact` moves pipeline stage: notify the assigned rep (`notify_team`), send a stage-update WhatsApp, create a `workflow` activity. Mirrors `tmpl_crm_stage_move`. |
| `gbp-auto-post.json` | Cron (daily, per-business time/timezone) | For businesses with `gbpAutoPostEnabled`, generate a post via AI and publish to Google Business Profile via `GBPAutoPostService`. Replaces the `gbp-auto-post` BullMQ worker. |
| `support-triage.json` | `message_received` / `ticket.created` | Incoming support message → AI classifies intent + priority, routes to the right team, drafts a reply. Mirrors `incoming-msg-autoreply` + `leadgen-ai-reply`. |
| `invoice-reminder.json` | `payment_due` / cron | Send WhatsApp + email payment reminders before/after due date; stop on payment. Mirrors `tmpl_payment_reminder`. |
| `ai-daily-report.json` | Cron (daily 08:00) | Calls `AvaIntelligenceService` daily briefing, summarizes via AI, pushes to the owner via WhatsApp/FCM. Free, DB-backed. |

## Common node types (BizzAuto → n8n)

- **Trigger:** `lead_created`, `message_received`, `stage_changed`, `payment_due`, `cart_abandoned`, `birthday_today`, or a Schedule node.
- **Actions:** `send_whatsapp` (→ `WhatsAppSendRouter`), `send_email` (→ `EmailService`/`brevo`), `add_tag`, `notify_team`, `create_activity`, `wait_delay`, `ai_reply` (→ `ai-gateway`), `ai_score_lead`.
- **Conditions:** `if_else` evaluated by `services/workflow/condition.evaluator.ts` for the in-app engine; in n8n use the native IF/Switch node.

## Deployment flow (planned)

1. Author JSON in `src/server/n8n-workflows/`.
2. `POST {N8N_URL}/api/v1/workflows` (with `X-N8N-API-KEY`) to import; capture `id`.
3. Persist the n8n `workflowId` on the corresponding `Workflow`/`AutomationRule` row so `routes/automation.ts` triggers it.
4. Triggering goes through the `DomainEvent` → `bizz:events` stream (see `N8N_ARCHITECTURE.md`).

See `AUTOMATION.md`, `N8N_ARCHITECTURE.md`.
