# Security

Security controls live in `src/server/middleware/*` and `services/security/*`. Lint rule `no-superuser-bypass` blocks disabling RBAC.

## Auth & RBAC
- JWT (`utils/jwtConfig.ts`, `middleware/auth.ts`): `Authorization: Bearer <jwt>`. Roles: `SUPER_ADMIN`, `OWNER`, `ADMIN`, `MANAGER`, `SALES_REP`, `STAFF`. `requireRole(...)` enforces.
- **Google OAuth**: `routes/auth.ts` (`/api/auth/google`, `/google/url`, `/google/callback`, `/google/link-url`, `/google/unlink`) via `services/google-oauth.service.ts` + `google-auth-library`. Apple Sign-In also supported.
- **n8n service auth**: `middleware/auth.ts#authenticateViaN8nApiKey` validates `x-n8n-api-key`, verifies HMAC `x-business-signature` over the body, and injects a system user scoped to `x-business-id` → prevents **tenant breakout**.
- **Multi-tenant scoping**: `req.user.businessId` from JWT, never from request body; enforced in every business query.

## Input / Output hardening (`middleware/`)
- `sanitizeInput` / `sanitizeRequestBody`: strips `<script>`, `javascript:`, `on*=` event handlers, control chars, dangerous protocols. `inputBlacklist` + `xssPatterns` deny-listed.
- `securityHeaders` (Helmet): CSP, `X-Frame-Options`, `HSTS`, `X-Content-Type-Options`.
- `piiMask`: masks emails/phones/IDs in logs.
- `noSqlInjectionProtection` (`services/sanitize.service.ts`): blocks `$`/`{` operators in query params/body.
- `apiVersioning`: rejects unknown API versions.

## Rate limiting (`middleware/rateLimiters.ts`, Redis-backed)
| Limiter | Scope | Limit |
|---------|-------|-------|
| `globalRateLimiter` / `globalApiLimiter` | IP+business | 100 req / 15 min |
| `authRateLimiter` / `loginRateLimiter` | email+IP | ~10 / 15 min |
| `aiApiRateLimiter` | business | 50 req / 15 min (grace 30) |
| `uploadRateLimiter` | business | 20 files / 15 min |
| `speedLimiter` | IP | 5 ms min interval |
| `ipBlockMiddleware` | global | blocks banned IPs |

Falls back to in-memory limiter if Redis is down (`USE_REDIS_CACHE=false` or no connection).

## CSRF / abuse
- `authenticatedCsrf` (double-submit token via `csrfProtection`) on state-changing routes. `csrfToken` route issues tokens.
- `requestTimeout` (15s default) prevents hanging requests.
- `ipBlockMiddleware` + `speedLimiter` mitigate brute force.

## Secrets & encryption
- `ENCRYPTION_KEY` (32-byte) → AES-256-GCM for tokens (`services/crypto.service.ts`, `utils/encryption.ts`). WhatsApp/GBP/integration secrets stored encrypted.
- `.env` is git-ignored; `.env.example` documents all vars. Never commit secrets (see `SECURITY.md` lint + pre-commit guidance).

## Network egress safety
- Outbound webhook + URL fetches go through **SSRF-safe** helpers: `isSsrfSafeUrl` / `isSafeUrl` block `169.254.169.254`, localhost, `*.internal`, link-local. `webhook-retry.service.ts` re-checks before each retry.

## CORS / tenant origin lock
- `allowedOrigins` from `Business.allowedOrigins`; default allow-list in `middlewareConfig`/`CORS_ORIGINS`. `getCorsOptions` enforces strict origins (`config.ts`).

## Audit
- `auditMiddleware` + `services/audit.service.ts` record privileged actions (auth, admin, automation edits) to an `AuditLog`/`Activity` table. `activity.service.ts` logs business events.

## Hardening notes
- `services/security/*.service.ts`: `security-alert.service.ts`, `security-monitor.service.ts`, `security-incident.service.ts`, `threat-detection.service.ts` monitor anomalies.
- `middleware/env-hardening.ts` validates required env at boot and warns on insecure defaults.

See `ARCHITECTURE.md`, `API.md`, `DEPLOYMENT.md`.
