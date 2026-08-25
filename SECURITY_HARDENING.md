# Security & Compliance Hardening — BizzAuto Automation

Status from the audit performed on this repo (committed state):

## Findings
- **No hardcoded secrets** in source. A scan of `src/**/*.ts` for `api_key|secret|token|password`
  literals found 0 matches; all credentials are read from `process.env` (422 `process.env` reads).
- **Config is env-driven.** Good baseline for secret management via Coolify/Vault.
- **Auth** uses JWT (`JWT_SECRET`) + API-key middleware (`api-key-auth.js`) + role guards
  (`requireRole`) already in place.

## Recommended hardening (do next)
1. **Secrets manager** — store `JWT_SECRET`, `ENCRYPTION_KEY`, `N8N_API_KEY`, DB/Redis creds in a
   secrets manager (Coolify secrets / Doppler / Vault), not in flat `.env` files in the repo.
   `.env.n8n.example` already documents required vars without real values.
2. **n8n exposure** — never expose n8n without auth on a public IP. Use Coolify basic-auth or a
   reverse proxy with SSO; restrict webhook paths with a secret. `N8N_SETUP.md` covers this.
3. **Webhook verification** — `inbound-webhooks` and lead-capture webhooks validate via
   `validateWebhook` + signature; ensure every external webhook source enforces it. Add a shared
   secret per source and reject unsigned payloads.
4. **Rate limiting** — lead capture uses `express-rate-limit` (`leadCaptureLimiter`). Extend limits
   to `/api/voice/transcribe` (large uploads) and `/api/metrics` (admin scraping).
5. **PII & audit** — `DomainEvent` + `Activity` tables already provide an audit trail. Ensure
   `AiUsageLog` (provider/model/tokens/cost) is retained for cost + compliance auditing.
6. **CORS / CSP** — review `corsOptions` in `index.ts`; lock origins to known frontends in prod.
7. **Dependency audit** — run `npm audit` in CI; the original repo carries a few pre-existing
   type-level issues (e.g. `review-qr-auto-reply.service` import, `workers/index.ts`
   `createRedisConnection` arg) that do not affect the esbuild runtime build but should be triaged.
8. **Backups** — Postgres + Redis (n8n queue) must be backed up; document RPO/RTO in Coolify.

## Non-goals (per master prompt)
- Do NOT rewrite the existing app. These are additive controls (docs, config, optional middleware).
