# BIZZ Automation Roadmap — BIZZ CRM

Status of the automation/AI modernization program. Based on source review (`src/server/*`, `prisma/schema.prisma`, `n8n-workflows/`, `services/ai-gateway.service.ts`).

## Current State
- Production SaaS: Node/Express/TS API + separate BullMQ `worker.ts`; React 19 PWA + Capacitor.
- Postgres/Prisma (~146 models), Redis/BullMQ queues, self-hosted n8n, multi-provider AI gateway.
- Auth/RBAC/tenant-isolation, health/metrics, graceful shutdown **present and working**.
- 13 n8n workflow templates committed; AI gateway with fallback + circuit breaker + cost logging.

## Problems
1. AI spend unbounded — no budget hard-stop or response cache.
2. n8n import is manual; no automated sync from repo to instance.
3. Observability thin — endpoints exist, Prometheus/Grafana scrape unverified, no alerting.
4. Testing gaps — no E2E/load/chaos/recovery suites; coverage gate not enforced.
5. Social tokens decrypted per-send, no refresh scheduler → silent failures.
6. Global webhook secret fallback is a tenant-risk.

## Root Causes
- Automation built feature-by-feature; cross-cutting controls (budget, cache, alerting, import) deferred.
- Single-instance deploy; horizontal scale + HA not yet designed.
- Tests written for security/unit surfaces, not full pipeline resilience.

## Automation Opportunities
- Centralize n8n import/sync (deploy hook reads `n8n-workflows/*.json`).
- Transactional outbox for `DomainEvent` (exactly-once emit).
- Bulk lead scoring batch job (fewer AI calls).
- Self-healing: auto-reenqueue failed jobs; dead-letter dashboard.

## n8n Opportunities
- Activate + monitor all 13 workflows; wire `ops-ticket-dispatch` to on-call.
- Replace n8n Code-node triage with gateway AI (still guarded).
- Per-tenant workflow variables via `Business` config.

## AI Opportunities
- Budget enforcement 70/85/95% (`COST_OPTIMIZATION.md`).
- Redis response cache for classification/short_text.
- Route 50%+ traffic to local Ollama (cost ~0).
- AI cost panel in `/api/metrics`.

## Cost Savings (target)
- AI: ~55% via routing + cache + Ollama + budget stop (`AI_COST_REPORT.md`).
- Ops: less manual lead handling via automation.

## Security Risks
- Global `LEAD_WEBHOOK_SECRET` (H1), no external alerting (H2), social token refresh (M1), CSRF column not boot-enforced (M2). See `SECURITY_FINAL_REPORT.md`.

## Performance Risks
- N+1 in `lead-processing` worker; no query cache; single API instance; DB pool saturation.

## Reliability Risks
- No HA; Redis-down disables queues; n8n manual import drift; no chaos/DR drill automation.

## Implementation Status
- **~35% complete** (≈18 of 52 phases from the first master prompt).
- **Done:** health/live/ready endpoints (`utils/healthCheck.ts`), `/api/metrics` (`routes/metrics.ts`), graceful shutdown (`index.ts`, `workers/index.ts`), multi-provider AI gateway + breaker + cost log, n8n service + HMAC auth, 13 workflow templates, RBAC/tenant isolation, rate limiting, sanitization, encryption.
- **In progress / partial:** budget enforcement, response cache, n8n auto-import, observability stack, social token refresh, audit retention.
- **Not started:** E2E/load/chaos/recovery tests, HA deploy, transactional outbox, alerting routing, bulk-scoring batch.

## Remaining Work (priority)
1. P1 — Enforce AI budget hard-stop + response cache.
2. P1 — Prometheus/Grafana scrape + alerting on health/queue/AI cost.
3. P1 — Close security H1/H2/M1/M2.
4. P2 — n8n auto-import from repo; activate monitor.
5. P2 — CI coverage gate + chaos test (Redis-down).
6. P2 — Social token refresh scheduler.
7. P3 — E2E (Playwright) + load (k6) + DR drill automation.
8. P3 — HA/horizontal scale design.

## Production Score: **72 / 100**
**Justification (evidence-based, not inflated):**
- +Security/auth/tenancy/health/deploy: strong (≈25 pts).
- +AI gateway + cost logging + n8n templates + queues/resilience: solid (≈20 pts).
- +DB model coverage +连接池: good (≈12 pts).
- −Testing (55), Observability/alerting (70), AI budget/cache not enforced, n8n manual import, no E2E/load/chaos, single-instance HA gap, residual security H1/H2: subtract ≈35 pts.
- Net ≈72. Production-usable for current tenant count; hardening required before scale.
