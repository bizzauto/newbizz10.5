# Deployment — BIZZ CRM

Production deploy via **Coolify** to a VPS. Repo: `bizzauto/newbizz10.5` (prod). Build = Docker (`Dockerfile`, `docker-compose.prod.yml`).

## Topology
- **API process**: `npm run start` → `src/server/index.ts` (Express + Socket.IO).
- **Worker process**: `npm run worker` → `src/server/worker.ts` (BullMQ). Run as a second service/container.
- **Postgres** (managed or container), **Redis** (BullMQ), **n8n** (self-hosted, separate).
- **nginx** + **Prometheus/Grafana** in `nginx/`, `monitoring/`, `prometheus/`.

## Zero-downtime
1. Coolify builds new image from `bizzauto/newbizz10.5`.
2. Run migrations as a pre-traffic step (see below) — migrations must be backward-compatible (additive) so old + new API versions coexist during cutover.
3. Coolify swaps the container behind the load balancer / nginx (rolling update, healthcheck on `GET /ready`).
4. Old container drains in-flight requests; graceful shutdown on `SIGTERM` (`index.ts:761 gracefulShutdown`, `worker.ts` SIGTERM → `shutdownWorkers`).

## Migrate on deploy
`start` script runs `prisma migrate deploy` (or `prisma db push` for parity). Ensure:
- Migration folder committed & tagged with the DB dump used in `DISASTER_RECOVERY.md`.
- `DATABASE_URL` from Coolify secret (TLS `sslmode=require`).
- Idempotent: `migrate deploy` applies only pending. Never run `migrate dev` in prod.

## Env (Coolify secret store — never commit)
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` (32-byte), `N8N_BASE_URL`, `N8N_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `LEAD_WEBHOOK_SECRET`, `BREVO_API_KEY`, `RAZORPAY_*`, `GBP_*`, `CORS_ORIGINS`, `DB_POOL_SIZE`, `SLOW_QUERY_LOG_ENABLED`, `USE_REDIS_CACHE`.

## Smoke test (post-deploy)
```bash
curl -f https://<host>/ready            # expect true
curl -f https://<host>/health           # status healthy/degraded
curl -H "Authorization: Bearer $TOKEN" https://<host>/api/metrics
# worker: docker logs worker | grep "All workers are running"
# n8n: curl $N8N_BASE_URL/healthz (or /api/v1/workflows with key)
```
- Create a test Contact via `POST /api/leads` (business token) → confirm `DomainEvent` row + notification.
- Confirm one BullMQ worker processing (enqueue a `whatsapp-messages` test job).

## Rollback
- Coolify keeps previous image; redeploy prior tag.
- If migration broke compat: restore from latest `pg_dump` (`DISASTER_RECOVERY.md`), redeploy matching app tag.
- Keep migrations additive to allow fast forward/back at app layer.

## Notes
- `scripts/build-server.js` (esbuild) compiles TS; `vite build` builds the PWA frontend.
- Single API instance today (no HA autoscale). Scale horizontally behind nginx once stateless (sessions are JWT, queues in Redis).
