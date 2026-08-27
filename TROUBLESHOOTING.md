# Troubleshooting — BIZZ CRM

Common failure modes + fixes. All paths real. Check logs first: `docker logs <svc>` or Coolify log view.

## Redis unreachable
**Symptoms:** BullMQ workers don't process; `/health` shows `redis: error` → `unhealthy`; console `[Workers] Redis not configured`.
**Cause:** `REDIS_URL` wrong, Redis down, or `USE_REDIS_CACHE=false`.
**Fix:**
- Verify `REDIS_URL` in Coolify env; `redis-cli ping`.
- App stays up; queues are **disabled** when Redis is down (`workers/index.ts` gates on `redisAvailable`). Async work (WhatsApp/campaigns/social) pauses but API serves.
- Restart worker after Redis recovers: `npm run worker`. Jobs created while down are lost (not enqueued) — re-trigger via admin.
**Prevent:** add Redis health alert; ensure BullMQ connection (`bullMQ:true`, no commandTimeout).

## n8n down / not configured
**Symptoms:** automation webhooks 401/timeout; `/api/metrics` `n8nConfigured:false`; `isN8nConfigured()` false.
**Cause:** `N8N_BASE_URL`/`N8N_API_KEY` unset, n8n instance stopped, or workflow inactive.
**Fix:**
- Confirm `N8N_BASE_URL` + `N8N_API_KEY` in env; `curl $N8N_BASE_URL/healthz`.
- Reactivate workflows in n8n UI (`n8n-workflows/README.md`).
- n8n→CRM calls rejected if HMAC `x-business-signature` mismatches (`middleware/auth.ts`) — regenerate key in both n8n and Coolify so they match.

## AI timeout / all providers failed
**Symptoms:** `AI_GATEWAY_ALL_PROVIDERS_FAILED` in logs; AI features error.
**Cause:** provider API key missing, rate limit, or network egress (IPv6 issue).
**Fix:**
- Check `OPENROUTER_API_KEY` / `OPENAI_API_KEY`; circuit breaker auto-skips a provider after 3 fails for 5 min (`ai-gateway.service.ts#getProviderStatus`).
- Set `OLLAMA_BASE_URL` for local fallback (no egress needed).
- DNS: `src/server/dns-config.js` forces IPv4-first — ensure it's imported first in worker (it is).
- Lower `max_tokens` default if latency high; verify `SLOW_QUERY_LOG` not the cause.

## Deploy fail
**Symptoms:** Coolify build red; container crash-loop; `/ready` false.
**Fix:**
- Read build log: `scripts/build-server.js` (esbuild) + `vite build`.
- Migration error: run `npx prisma migrate deploy` manually against `DATABASE_URL`; ensure schema committed. Never `migrate dev` in prod.
- Missing env: `middleware/env-hardening.ts` warns at boot — set required vars in Coolify.
- Port/env mismatch: confirm `PORT` and nginx upstream.
- Rollback: redeploy previous Coolify tag; if migration broke compat, restore `pg_dump` (`DISASTER_RECOVERY.md`).

## Tenant breakout / 403 on n8n calls
**Symptom:** n8n→CRM returns 403 "Invalid business signature".
**Fix:** `x-business-signature` must equal HMAC-SHA256(`N8N_API_KEY`, businessId). Regenerate/align `N8N_API_KEY` across n8n + app.

## WhatsApp send failing
**Fix:** check `whatsapp-rate-limit.ts`; verify Evolution/Cloud API token; template name/language; media URL reachable + SSRF-safe. Worker concurrency 10.

## DB slow / degraded
**Symptom:** `/health` `database: degraded` (>1000ms); `pool_timeout=10` errors.
**Fix:** raise `DB_POOL_SIZE`; add pgbouncer; index hot paths (`DATABASE.md`); enable `SLOW_QUERY_LOG_ENABLED=true`.

## Memory pressure
**Symptom:** `/health` `memory: error` (heap >90%).
**Fix:** profile leaks; lower worker concurrency; scale API horizontally (stateless).
