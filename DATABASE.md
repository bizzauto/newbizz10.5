# Database

PostgreSQL via **Prisma 5** (`prisma/schema.prisma`, ~150 models). Migrations applied automatically at startup (`package.json` `start` → `prisma migrate deploy` / `prisma db push`). Connection via `DATABASE_URL`.

## Key Models (relevant to automation/AI/n8n)

| Model | Fields (subset) | Purpose |
|-------|-----------------|---------|
| `Business` | `id`, `name`, `slug`, `plan`, WhatsApp/GBP tokens, `gbpAutoPostEnabled`, `timezone`, `allowedOrigins Json?` | Tenant root. |
| `User` | `id`, `businessId?`, `email`, `role`, `googleId?`, `phone?` | Staff; `SUPER_ADMIN` is platform-wide. |
| `Lead` | `businessId`, `name`, `phone`, `email`, `score?`, `stage?`, `source?` | Captured leads. |
| `AutomationRule` | `businessId`, `name`, `description?`, `isActive`, `trigger Json`, `actions Json[]`, `runCount`, `lastRunAt` | DB-driven automation (legacy). |
| `Workflow` | `businessId`, `name`, `triggerType`, `triggerConfig`, `nodes Json`, `edges Json`, `isActive`, `createdBy` | Visual node/edge automation graph. |
| `WorkflowRun` | `workflowId`, `businessId`, `triggeredBy`, `status`, `startedAt`, `completedAt` | Execution log for `Workflow`. |
| `WorkflowExecution` | (execution detail rows) | Step-level workflow execution trace. |
| `ChatbotFlow` | `businessId`, `name`, `trigger`, `keywords Json`, `response`, `aiEnabled`, `isActive` | Legacy auto-reply rules. |
| `DomainEvent` | `id`, `eventType`, `businessId?`, `payload Json`, `idempotencyKey? @unique`, `status`, `error?`, `createdAt` | **Event bus store** (see `N8N_ARCHITECTURE.md`). Idempotent on `idempotencyKey`. |
| `AiUsageLog` | `id`, `businessId?`, `provider`, `model`, `task`, `tokensIn`, `tokensOut`, `costUsd`, `latencyMs`, `success`, `createdAt` | AI cost/usage tracking (gateway + services). |
| `DeviceToken` | `id`, `userId`, `businessId?`, `token @unique`, `platform`, `appVersion`, `isActive`, `createdAt`, `updatedAt` | Push device registration (FCM/Capacitor). |
| `Integration` | `businessId`, `type`, `name`, `config Json`, `isActive`, `lastSyncAt?`, `lastError?`, `webhookUrl?` | Third-party integration config. `@@unique([businessId, type])`. |
| `LeadScore` | `leadId`, `businessId`, `score`, `factors Json`, `createdAt` | Lead scoring output. |
| `ScheduledMessage` | `businessId`, `contactId?`, `scheduledAt`, `status`, `payload Json` | Queue for `scheduled-message` worker. |
| `OutboundWebhook` | `businessId`, `url`, `events Json`, `secret`, `isActive` | Outbound webhook subscriptions. |

## Connection / pooling
- `src/server/db.ts` exports a singleton `PrismaClient` with `log: ['error', 'warn']` and `maxWait`/`connectionLimit` tuned for serverless/container (guard against multiple instances in dev via `globalThis`).
- Migrations: never `prisma migrate dev` in prod; use `migrate deploy`. The `start` script runs `prisma generate` then deploy.

## Tenant isolation
- Every business-scoped query adds `where: { businessId: req.user.businessId }`; `SUPER_ADMIN` bypasses. Prisma schema uses `@@index([businessId])` on most tables.

## Migrating the event store (planned)
- `DomainEvent` is the source of truth today. The roadmap adds a **Redis Stream `bizz:events`** (`XADD` from `emitEvent`) so n8n can consume `DomainEvent`s as a durable replayable feed — `DomainEvent` stays the audit/backup copy.

See `ARCHITECTURE.md`, `N8N_ARCHITECTURE.md`, `SECURITY.md`.
