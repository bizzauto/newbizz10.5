# Security Final Report — BIZZ CRM

Based on `SECURITY.md`, `middleware/auth.ts`, and the source tree. Severity per likelihood × impact.

## Resolved
- ✅ JWT auth + RBAC (`SUPER_ADMIN/OWNER/ADMIN/MANAGER/SALES_REP/STAFF`) via `requireRole`, `requireBusinessOwner`, `requireBusinessAccess`.
- ✅ n8n service auth with timing-safe key compare + HMAC-signed `x-business-id` (tenant-breakout defense) — `middleware/auth.ts#authenticateViaN8nApiKey`.
- ✅ Multi-tenant scoping: `businessId` from JWT only, never request body (`requireBusinessAccess`).
- ✅ Input sanitization (`sanitizeInput`/`sanitizeRequestBody`), XSS patterns, control-char strip.
- ✅ Security headers via Helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- ✅ CSRF double-submit token on state-changing routes.
- ✅ Rate limiting Redis-backed with in-memory fallback (`rateLimiters.ts`): global 100/15m, auth ~10/15m, AI 50/15m, upload 20/15m.
- ✅ PII masking in logs (`piiMask`).
- ✅ NoSQL injection protection (`$`/`{` blocked).
- ✅ Secrets AES-256-GCM (`utils/encryption.ts`, `services/crypto.service.ts`); `.env` git-ignored.
- ✅ SSRF guard (`isSsrfSafeUrl`/`isSafeUrl`) blocks metadata IP, localhost, `*.internal`.
- ✅ CORS origin lock via `Business.allowedOrigins`.
- ✅ Audit logging (`auditMiddleware`, `services/audit.service.ts`) for privileged actions.
- ✅ Tenant isolation covered by `tests/security/tenant-isolation.test.ts`.

## Findings

### Critical
- None outstanding. (No path allows cross-tenant read/write given `requireBusinessAccess` + HMAC.)

### High
- **H1 — Global webhook secret fallback.** `validateWebhook` accepts `LEAD_WEBHOOK_SECRET` as an extra accepted secret for any business. *Impact:* a single leaked global secret compromises all tenants' lead ingestion. *Fix:* remove global fallback; per-business `leadWebhookSecret` only. *Priority: HIGH.*
- **H2 — No confirmed external alerting on auth abuse.** `ipBlockMiddleware` + `security-*` services detect, but no verified alert route to ops. *Fix:* wire `security-incident.service.ts` → Slack/email. *Priority: MEDIUM-HIGH.*

### Medium
- **M1 — Social tokens decrypted per-publish, no refresh scheduler.** `workers/index.ts` `decrypt`s FB/IG/LinkedIn/Twitter/GBP tokens at send time; expiry not proactively refreshed. *Impact:* silent send failures. *Fix:* token-refresh cron + `refreshedAt` column. *Priority: MEDIUM.*
- **M2 — CSRF token creation can fail open.** `middleware/auth.ts` logs and continues without CSRF if column missing. *Impact:* degraded protection if migration not baselined. *Fix:* enforce column presence at boot (`env-hardening.ts`). *Priority: MEDIUM.*
- **M3 — `MEMBER` email-verified not hard-blocked.** Intentional (session not wiped) but client must prompt. *Impact:* unverified members act. *Fix:* verify client enforcement; consider stricter for特权 routes. *Priority: MEDIUM.*

### Low
- **L1 — Auto-create business on auth** (`auth.ts:193`) if `businessId` null — convenience with audit trail; ensure orphan cleanup job. *Priority: LOW.*
- **L2 — `eventBus` failures are swallowed** (`events/eventBus.ts`) — acceptable for availability, but ensure dead-letter for `DomainEvent`. *Priority: LOW.*

## OWASP mapping
- A01 Broken Access Control → mitigated (RBAC + tenant scope).
- A02 Cryptographic Failures → mitigated (AES-256-GCM, TLS).
- A03 Injection → mitigated (sanitize + NoSQL guard + Prisma parameterized).
- A05 Security Misconfig → mitigated (`env-hardening.ts`, Helmet).
- A07 Auth Failures → mitigated (JWT, rate limit, IP block).
- A10 SSRF → mitigated (`isSsrfSafeUrl`).
- Residual: A04/A08 (logging/monitoring alerting) partially covered.

## Remaining work
Enforce H1 (drop global webhook secret), add alert routing (H2), social token refresh (M1), boot-time CSRF column check (M2).
