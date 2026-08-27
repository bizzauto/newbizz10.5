# Monitoring — BIZZ CRM

Runtime observability surface. (Prometheus/Grafana referenced in `ARCHITECTURE.md`; confirm scrape jobs are deployed — currently app-level endpoints only.)

## Health endpoints (no auth)
Implemented in `src/server/utils/healthCheck.ts`, mounted in `src/server/index.ts`:

| Endpoint | Checks | Returns |
|----------|--------|---------|
| `GET /health` | db, redis, memory | `{ status: healthy|degraded|unhealthy, uptime, version, checks }` |
| `GET /live` | process alive | `true` (liveness probe) |
| `GET /ready` | db `SELECT 1` | `true/false` (readiness probe) |

Status logic: any `error` → `unhealthy`; any `degraded` (db >1000ms, redis >500ms, heap >70%) → `degraded`.

## Business / runtime metrics
`GET /api/metrics` (`routes/metrics.ts`) — `OWNER`/`ADMIN`, business-scoped:
- `uptimeSeconds`, `n8nConfigured`
- `events.total24h` + `events.byType` (`DomainEvent`)
- `crm.leads24h`, `dealsOpen`, `invoicesPaid24h`, `appointmentsToday`

## BullMQ metrics
Queues (`workers/index.ts`): `whatsapp-messages`, `emails`, `social-publish`, `google-sheets-sync`, `lead-processing`, `campaign-scheduler`, `gbp-auto-post`, `webhookRetry`.
- BullMQ exposes queue stats via Redis; visualize with **Bull Board** or `bullmq` `Queue.getJobCounts()` (active/waiting/completed/failed/delayed).
- Worker concurrency: whatsapp 10, email 5, social 5, sheets 3, lead 10, campaign 5, gbp 5.
- Failed jobs retained 7d (`removeOnFail: { age: 604800 }`); completed 1d.
- Alert on `failed` count growth or `waiting` backlog > threshold.

## Logs
- Structured `console` logs via `utils/logger.ts` (winston-style). PII masked (`piiMask`).
- Slow query log gated by `SLOW_QUERY_LOG_ENABLED=true` + `production` (`db.ts`).
- Worker heartbeat every 60s (`worker.ts`).
- Event stream: Redis `bizz:events` (`events/eventBus.ts`).

## Alerting (recommended)
Not yet verified end-to-end. Wire:
1. Prometheus scrape `/api/metrics` + `/health` (every 15s).
2. Grafana dashboards: latency, error rate, queue depth, AI cost (`AiUsageLog`).
3. Alerts: `/health=unhealthy`, `redis` error, `failed` jobs > N, AI budget 85%/95% (`COST_OPTIMIZATION.md`), auth abuse (`security-incident.service.ts` → Slack/email).
4. `ops-ticket-dispatch.json` n8n workflow for on-call notify.

## Log locations (Coolify/VPS)
- Container stdout/stderr → Coolify log view / `docker logs`.
- Persist to volume if needed; ship to Loki/ELK for search.
