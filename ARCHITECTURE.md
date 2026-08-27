# Architecture — BIZZ CRM

BizzAuto CRM: all-in-one CRM / marketing-automation SaaS for small businesses. Web + Capacitor mobile + WhatsApp/GBP/Social integration layer.

## Target architecture

```
                         ┌─────────────────────────────────────────────┐
        Users ─────────► │  React 19 PWA (Vite)  │  Capacitor (iOS/And) │
                         └───────────────┬─────────────────────────────┘
                                         │ HTTPS (CORS, Helmet, CSRF)
                                         ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  BIZZ CRM  (Node/Express 4 + TS)                               │
        │  ┌────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
        │  │ API process│  │ Worker proc  │  │ Socket.IO (real-time)   │ │
        │  │ index.ts   │  │ worker.ts    │  │ websocket.ts            │ │
        │  │ auth/RBAC  │  │ BullMQ       │  │                         │ │
        │  │ routes/*   │  │ workers/*    │  │                         │ │
        │  └─────┬──────┘  └──────┬──────┘  └─────────────────────────┘ │
        │        │ emitEvent       │ enqueue                            │
        └────────┼─────────────────┼───────────────────────────────────┘
                 │                 │
   ┌─────────────┼────────┐   ┌────┼──────────────────────────────┐
   │ Observability       │   │ Redis/BullMQ                        │
   │ /health /live/ready │   │ bizz:events stream + job queues     │
   │ /api/metrics        │   └────┬──────────────────────────────┘
   │ logs (piiMask)      │        │
   └─────────────────────┘        │
                                   ▼
        ┌──────────────────────────────────┐      ┌──────────────────────┐
        │  AI Gateway (ai-gateway.service)  │─────►│ Providers            │
        │  router · fallback · breaker ·    │      │ OpenRouter/OpenAI/   │
        │  cost log (AiUsageLog) · guardrails│      │ Ollama (local)      │
        └───────────────┬──────────────────┘      └──────────────────────┘
                        │ emitEvent → Redis stream
                        ▼
        ┌──────────────────────────────────┐      ┌──────────────────────┐
        │  n8n (self-hosted)                │      │ Postgres + Prisma    │
        │  n8n-workflows/*.json             │      │ ~146 models          │
        │  HMAC x-business-signature        │      │ businessId tenancy   │
        └──────────────────────────────────┘      └──────────────────────┘
```

## System boundaries
- **BIZZ CRM**: owns auth, CRM data, queues, AI orchestration, event emission.
- **n8n**: owns cross-system automation (Clearbit, Slack, GBP, helpdesk, billing). Talks to CRM via `X-N8N-API-KEY` + HMAC-signed `businessId`.
- **AI Gateway**: owns provider selection, cost, fallback, guardrails. Never calls mutating tools directly (see `AI_GUARDRAILS.md`).
- **Postgres**: system of record. **Redis/BullMQ**: async work + event stream (rebuildable).
- **Observability**: health/metrics/logs, external Prometheus/Grafana (recommended).

## Event flow (example: new lead)
1. Source (webhook/IndiaMART/forms) → `validateWebhook` → `POST /api/leads`.
2. `lead-processing` BullMQ worker: upsert Contact, auto-assign, notify users, score (`workers/index.ts`).
3. `emitEvent('lead.captured', …)` → Redis stream `bizz:events` + `DomainEvent` row (`events/eventBus.ts`).
4. n8n (if subscribed) consumes stream / webhook → enrich + WhatsApp welcome + nurture.
5. AI (if enabled) drafts reply via `ai-gateway.service.ts` (logged to `AiUsageLog`).

## Request lifecycle
See `ARCHITECTURE` in `PRODUCTION_READINESS.md` + `SECURITY.md`. Mount order in `index.ts`: CORS → compression → morgan → json → cookie → Helmet → sanitize → PII mask → timeout → ipBlock → speed → global limiter → `authenticate` → `requireRole` → routes.

## Tech stack
Frontend React 19/Vite/Tailwind v4/Zustand/TanStack Query/Radix/i18next (PWA + Capacitor 8). Backend Node/Express 4/TS (esbuild). DB Postgres/Prisma 5. Cache/queues Redis/BullMQ 5 (ioredis). Auth JWT + Google OAuth + Apple + SSO. AI multi-provider gateway + AVA. Deploy Docker/Coolify + nginx + Prometheus/Grafana.

See `N8N_ARCHITECTURE.md`, `AI_ARCHITECTURE.md`, `AUTOMATION.md`, `DATABASE.md`, `API.md`, `SECURITY.md`.
