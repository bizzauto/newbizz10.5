# API Reference

All routes are mounted under `/api` in `src/server/index.ts`. State-changing routes are wrapped in `authenticatedCsrf`; most are gated by `authenticate` (+ `requireRole`). Below are the major groups.

| Mount | File | Purpose |
|-------|------|---------|
| `/api/auth` | `routes/auth.ts` | Email/password, **Google OAuth** (`/google`, `/google/url`, `/google/callback`, `/google/link-url`, `/google/unlink`), Apple Sign-In, JWT issue/refresh, super-admin bootstrap. |
| `/api/user`, `/api/team` | `user.ts`, `team.ts` | Profile, staff/team management (RBAC). |
| `/api/business` | `business.ts` | Tenant (`Business`) settings, WhatsApp/GBP tokens, auto-reply config. |
| `/api/leads` | `leads.ts` | Lead CRUD, scoring, Google Sheets sync. |
| `/api/deals` | `deals.ts` | Pipeline deals. |
| `/api/contacts` | `contacts.ts` | CRM contacts. |
| `/api/pipelines` | `pipelines.ts` | Pipeline/stage definitions. |
| `/api/crm-invoices` | `crm-invoices.ts` | Invoices/billing. |
| `/api/automation` | `automation.ts` | **Automation engine + n8n client** (rules, workflows, deploy-templates, `/n8n/*`). |
| `/api/ai` | `ai.ts` (alias `aiRoutes`) | AI features (rate-limited by `aiApiRateLimiter`). |
| `/api/ava` | `ava.ts` | AVA assistant + n8n trigger/status. |
| `/api/intelligence` | `intelligence.ts` | AVA intelligence dashboards. |
| `/api/webhooks` | `webhooks.ts` | Outbound webhook CRUD (SSRF-protected test). |
| `/api/webhooks/meta-leads` | `meta-leads.ts` | **Inbound** Meta Lead Ads (signature-verified, public). |
| `/api/integrations` | `integrations.ts` | Third-party integrations catalog. |
| `/api/google-business` | `google-business.ts` | Google Business Profile OAuth + posts. |
| `/api/whatsapp`, `/api/evolution` | `whatsapp.ts`, `evolution.ts` | WhatsApp (Meta + Evolution API) messaging. |
| `/api/email`, `/api/brevo-email` | `email.ts`, `brevo-email.ts` | Email sending/campaigns. |
| `/api/social-accounts/*` | `social-accounts.ts`, `social-facebook/linkedin/twitter/youtube.ts` | Social publishing. |
| `/api/notifications`, `/api/fcm`, `/api/push-devices` | `notifications.ts`, `fcm.ts`, `push-devices.ts` | Push notifications + device tokens. |
| `/api/super-admin` | `super-admin.ts` | Platform owner ops. |
| `/api/admin/queues` | `admin-queues.ts` | **BullMQ monitoring + dead-letter recovery** (SUPER_ADMIN). |
| `/api/status` | `status-health.ts` | `/health` connectivity summary (db/whatsapp/n8n/ai). |
| `/api/monitoring` | `monitoring.ts` | Prometheus metrics (keyed by `MONITOR_KEY`). |
| `/api/campaigns`, `/api/posts`, `/api/reviews*`, `/api/appointments`, `/api/conversations`, `/api/ecommerce`, `/api/subscriptions`, `/api/support-tickets`, `/api/voice-calls`, `/api/video-meetings`, `/api/surveys`, `/api/referrals`, `/api/loyalty`, `/api/documents`, `/api/custom-fields`, `/api/funnels`, `/api/cart-recovery`, `/api/live-chat`, `/api/client-portal`, `/api/courses`, `/api/blog`, `/api/store*`, `/api/agency`, `/api/white-label`, `/api/trigger-links`, `/api/review-requests`, `/api/review-qr`, `/api/sms-marketing`, `/api/claude-whatsapp`, `/api/unofficial-whatsapp`, `/api/wave`, `/api/dograh/webhook`, `/api/indiamart-email`, `/api/instagram`, `/api/lead-finder`, `/api/reports`, `/api/settings`, `/api/customer-security`, `/api/upload`, `/api/payment-links` | respective `*.ts` | Domain features. |

### Conventions
- Auth: `Authorization: Bearer <jwt>`; n8n service calls use `x-n8n-api-key` + `x-business-id` + `x-business-signature` (`middleware/auth.ts`).
- Responses: `{ success, data, ... }` via `utils/response.ts`.
- Versioning: `apiVersioning` middleware on `/api`.
- Rate limits: `globalApiLimiter`, `aiApiRateLimiter` (`/api/ai`), `uploadRateLimiter` (`/api/upload`), `authRateLimiter`/`loginRateLimiter` (`/api/auth`).

See `ARCHITECTURE.md`, `SECURITY.md`.
