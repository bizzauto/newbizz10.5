# Automation — BIZZ CRM

Event-driven automation core. Combines a domain-event bus, BullMQ workers, n8n workflows, and a human-approval boundary.

## Event-driven architecture
`src/server/events/eventBus.ts` — `emitEvent(type, payload, { businessId, actorId, idempotencyKey })`:
1. Publishes to Redis stream `bizz:events` (`XADD`) for n8n / real-time consumers.
2. Persists an immutable `DomainEvent` row (`status:'processed'`) for audit/replay.
3. Best-effort: never throws to caller; logs on failure.

> Note: this is **not** a transactional outbox. If the DB commit and stream publish must be atomic (exactly-once), wrap in a DB transaction + poll `DomainEvent` for un-emitted rows. Today it's at-least-once with idempotency keys.

## Outbox consideration
- `idempotencyKey` = `${type}:${hash(payload)}:${Date.now()}` (or caller-supplied). Consumers should dedupe on this key.
- For true outbox: add an `emittedToStream Boolean` column + a relay worker that `XADD`s rows where `emitted=false`, then marks them. Roadmap item.

## Follow-up / nurture engine
- `scheduledMessage` (DB) + BullMQ `whatsapp-messages` job `scheduled-message` (`workers/index.ts`, `scheduled-message.worker.ts`).
- `campaigns.ts` + `campaign-scheduler` worker (repeat 60s) dispatches due campaigns to `whatsapp-messages`.
- n8n `lead-capture.json` enrolls leads into `new_lead_14d` nurture sequence.
- Condition evaluator unit-tested (`tests/unit/condition.evaluator.test.ts`).

## Human approval boundary
AI/automation may draft, but sending/bulk/mutating actions require approval (`AI_GUARDRAILS.md`):
| Action | Tier | Gate |
|--------|------|------|
| Draft/summarize | 1 (auto) | `aiComplete` |
| Send to a contact | 2 | approval flag on `/api/whatsapp`, `/api/campaigns` |
| Bulk campaign / create records | 3 | `requireRole('OWNER','ADMIN')` |
| Billing/financial | 4 | forbidden |

Approvals logged to `AuditLog`/`Activity` (`services/audit.service.ts`).

## Worker resilience
- All queues created lazily; **disabled if Redis unreachable** (`workers/index.ts` gates on `redisAvailable`). App stays up without async work.
- Default job opts: 3 attempts, exponential backoff 5s, completed retained 1d, failed 7d.
- `startCampaignDispatcher` / `startSocialDispatcher`: idempotent repeatable ticks (60s) scanning DB.
- Graceful shutdown: `shutdownWorkers()` closes all workers + Redis (`worker.ts` SIGTERM/SIGINT).

## Scheduling
- DB-driven: `scheduledAt` on `ScheduledMessage`/`Post`/`Campaign` scanned by dispatchers.
- n8n cron for GBP/invoice/report workflows.
- IndiaMART autosync poller every 5 min (`indiamart-sync.service.ts`).

## Observability
- Queue depth via BullMQ stats; event volume via `DomainEvent` count in `/api/metrics`.
- Failures surface in worker logs + `failed` job counts.
