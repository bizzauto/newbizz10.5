# Monitoring

Observability for the BizzAuto server: health endpoints, metrics, queue monitoring, and cost tracking.

## Health checks — `routes/status-health.ts` (`/api/status`)
- `GET /api/status/health` → summarizes connectivity:
  ```json
  { "whatsapp": {"status":"ok"|"error"}, "n8n": {...}, "ai": {...}, "db": {"status":"ok"|"error"} }
  ```
- `checkDb` (Prisma `$queryRaw SELECT 1`), `checkWhatsApp` (Meta/Evolution API ping), `checkN8n` (`GET {N8N_URL}/healthz`), `checkAi` (keys present + provider pings: OpenRouter/Gemini/Anthropic).
- `GET /api/status/ready` liveness for Docker/Coolify.

## Graceful shutdown — `utils/gracefulShutdown.ts`
- On `SIGTERM`/`SIGINT`: stops accepting connections, closes BullMQ workers (`shutdownAllWorkers`), Prisma, Redis.

## Prometheus metrics — `routes/monitoring.ts` (`/api/monitoring/metrics`)
- Exposed behind `MONITOR_KEY` (query param / header). Standard node + custom counters (requests, AI calls, queue depth).
- Scrape config in `monitoring/prometheus/prometheus.yml`; dashboards in `monitoring/grafana/`.
- nginx routes `/metrics` in `monitoring/nginx/`.

## BullMQ / queue monitoring — `routes/admin-queues.ts` (`/api/admin/queues`, SUPER_ADMIN)
| Endpoint | Purpose |
|----------|---------|
| `GET /api/admin/queues` | List queues + job counts. |
| `GET /api/admin/queues/:queue/jobs` | Jobs (active/completed/failed/waiting) with optional `status` filter. |
| `GET /api/admin/queues/:queue/failed` | Failed jobs (dead-letter view). |
| `POST /api/admin/queues/:queue/:id/retry` | Requeue a failed job. |
| `POST /api/admin/queues/:queue/:id/remove` | Delete a job. |
| `POST /api/admin/queues/:queue/clean` | Clean a status. |
| `GET /api/admin/queues/metrics` | Aggregate counts.

## AI cost monitoring — `AiUsageLog` + `ai-analytics.service.ts`
- Every AI call (gateway + services) writes an `AiUsageLog` (`provider`, `model`, `task`, `tokensIn`, `tokensOut`, `costUsd`, `latencyMs`, `success`).
- `routes/intelligence.ts` / `ai-analytics.service.ts` aggregate spend per `businessId` → cost dashboards. **Planned:** per-business token-bucket rate limit + budget alerts.

## Logging
- `morgan` HTTP logs; `utils/logger.ts` (winston-style) with `piiMask`. `LOG_LEVEL` env. `errorHandler` centralizes error responses (`utils/error.ts`).

## Alerts (planned)
- Wire `security-monitor.service.ts` + `metrics` → Grafana alerts (queue backlog, AI spend spike, WhatsApp/n8n down).

See `ARCHITECTURE.md`, `N8N_ARCHITECTURE.md`, `AI_ARCHITECTURE.md`, `DEPLOYMENT.md`.
