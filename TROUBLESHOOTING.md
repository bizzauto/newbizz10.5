# Troubleshooting

Quick fixes for common BizzAuto runtime issues.

## Workers don't process jobs
- **Symptom:** WhatsApp messages, emails, social posts, scheduled messages never send.
- **Cause:** Redis down or worker not running. `workers/index.ts` disables queues if `redisAvailable` is false.
- **Fix:** Confirm `REDIS_URL`/`REDIS_HOST` reachable; start `npm run worker` as a separate process; check `GET /api/admin/queues` shows queues. Look for `[workers] Redis unavailable, skipping queue init` in logs.

## n8n triggers fail / "n8n unreachable"
- **Symptom:** `GET /api/automation/n8n/status` returns error; automations that call n8n hang.
- **Fix:** Verify `N8N_URL` is correct and reachable from the server. Confirm `N8N_APP_API_KEY` (or `N8N_API_KEY`) matches n8n's API key. If `N8N_URL` is `https` on a self-signed host, `getN8nHttpsAgent()` disables cert checks only for internal hosts.

## Automation rules not firing
- **Symptom:** No WhatsApp/email on new lead.
- **Fix:** Check the `AutomationRule.isActive` flag and that the trigger matches (e.g. `lead.created`). Events are emitted via `emitEvent` → `DomainEvent`. If a handler throws, the event is marked `partial_error` but other handlers still run. Inspect `DomainEvent.status`/`error`.

## AI calls fail / high cost
- **Symptom:** 500s on `/api/ai`, or surprise spend.
- **Fix:** Confirm at least one provider key is set (`NVIDIA_NIM_API_KEY` first). Check `AiUsageLog` for `success=false`/spikes. Gateway circuit-breaker skips a provider for 5 min after 3 failures — verify via `GET /api/status/health` → `ai`. For local/free inference set `OLLAMA_BASE_URL` + `OLLAMA_MODEL`. (Per-business rate limit is planned.)

## WhatsApp messages not sending
- **Fix:** Verify the business has valid WhatsApp tokens in `Business`/`Integration` (encrypted). `checkWhatsApp` in `/api/status/health` shows status. Rate limits apply (`WhatsAppRateLimiter` in `scheduled-message.worker.ts`).

## DB migration errors on deploy
- **Symptom:** `npm start` fails at `prisma migrate deploy`.
- **Fix:** Ensure `DATABASE_URL` is correct and the DB is reachable. Use `migrate deploy` (never `migrate dev` in prod). If schema drift, back up then reconcile manually.

## Build errors (`build:server`)
- **Symptom:** esbuild/TS errors compiling the server.
- **Fix:** Run `npm run build:server` locally to see errors; ensure no syntax issues. The script uses `scripts/build-server.js` (esbuild, ESM) — check `package.json` engines.

## Push notifications not delivered
- **Fix:** Confirm the device registered a `DeviceToken` (via `/api/fcm` or `/api/push-devices`). FCM keys are per-business (in `Integration`/`Business` config). Check `fcm.service.ts` / `push-notification.service.ts` logs.

## Redis Stream `bizz:events` missing
- **Expected:** this is **planned**, not yet implemented. The event bus currently writes to `DomainEvent` only (no Redis stream). n8n consumes events via direct REST triggers (`routes/automation.ts`), not by subscribing to `bizz:events` yet.

## CORS / tenant errors
- **Fix:** Add the client origin to `Business.allowedOrigins` or `CORS_ORIGINS`. n8n callbacks must include `x-n8n-api-key`, `x-business-id`, and a valid `x-business-signature` (HMAC) or they are rejected (`middleware/auth.ts`).

See `ARCHITECTURE.md`, `N8N_ARCHITECTURE.md`, `MONITORING.md`, `DEPLOYMENT.md`.
