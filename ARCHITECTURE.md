# Architecture

BizzAuto CRM — an all-in-one CRM / marketing-automation platform for small businesses, shipped as a web app, a Capacitor mobile app, and a WhatsApp/GBP/Social integration layer.

## Tech Stack

- **Frontend:** React 19 + Vite + TypeScript, Tailwind CSS v4, React Router v7, Zustand (state), TanStack Query (server state), Radix UI, i18next. Built as a PWA (`vite-plugin-singlefile`) and wrapped with Capacitor 8 (`@capacitor/core`, camera, filesystem, push-notifications) for Android/iOS.
- **Backend:** Node.js + Express 4, TypeScript (compiled via `scripts/build-server.js` / esbuild). Single process serves REST API + Socket.IO (`websocket.ts`). A separate worker process runs BullMQ jobs.
- **Database:** PostgreSQL via **Prisma 5** (`prisma/schema.prisma`, ~150 models). Migrations applied with `prisma migrate deploy` / `prisma db push` at startup (see `package.json` `start` script).
- **Cache / Queues:** Redis + **BullMQ 5** (`ioredis`). Connection via `utils/redis-connection.ts`. All queues are created lazily and **disabled if Redis is unreachable** (`workers/index.ts` gates on `redisAvailable`).
- **Push:** FCM / OneSignal via `services/fcm.service.ts` + `services/push-notification.service.ts`; device tokens stored in `DeviceToken`. In-app push also via Capacitor push plugin.
- **Auth:** JWT (`jsonwebtoken`) + Google OAuth (`google-auth-library`). Role-based (`SUPER_ADMIN`, `OWNER`, `ADMIN`, …) via `middleware/auth.ts`.
- **AI:** Multi-provider OpenAI-compatible clients (`ai.service.ts`), AVA intelligence (`ava-intelligence.service.ts`), and an AI gateway (`ai-gateway.service.ts`). Free tiers (NVIDIA NIM, Groq) preferred.
- **Deploy:** Docker (`Dockerfile`, `docker-compose.prod.yml`) on **Coolify**/VPS. Prometheus + Grafana + nginx included in `monitoring/`, `prometheus/`, `nginx/`.

## Request Lifecycle

1. `src/server/index.ts` mounts global middleware: CORS, `compression`, `morgan`, `express.json`, `cookieParser`, `securityHeaders` (Helmet — `middleware/security-headers.ts`), `sanitizeInput` / `sanitizeRequestBody` (input sanitization), PII masking, `requestTimeout`, `ipBlockMiddleware`, `speedLimiter`, `globalApiLimiter`.
2. `app.use('/api', apiVersioning, ...)` → per-route groups (`app.use('/api/leads', ...)`, etc.).
3. `authenticate` middleware (`middleware/auth.ts`) verifies the JWT and populates `req.user` (`id`, `businessId`, `role`). An `x-n8n-api-key` header path authenticates n8n service-to-service calls.
4. `requireRole(...)` enforces tenant-level authorization. `authenticatedCsrf` enforces CSRF on state-changing routes.
5. Route handlers call Services → Prisma. Background work is enqueued to BullMQ (`workers/index.ts`).
6. Domain events are emitted via `emitEvent()` (`services/event-bus.service.ts`) and persisted to `DomainEvent` (see `DATABASE.md`).
7. Responses shaped by `utils/response.ts`; errors centralized in `utils/error.ts`; all activity audited (`auditMiddleware`, `services/audit.service.ts`).

## Multi-Tenancy (via `businessId`)

Every tenant is a `Business` row. Almost all models carry a `businessId String` column (Prisma `@@index([businessId])`). Tenant isolation is enforced in two layers:
- **Query scoping:** service/route code always adds `where: { businessId: req.user.businessId }`.
- **Auth context:** `req.user.businessId` is set from the JWT, never trusted from the request body.

`User.businessId` links staff to a business; `SUPER_ADMIN` (platform owner) bypasses tenant scoping. See `SECURITY.md`.

## Auth — Google OAuth

- `routes/auth.ts`: `GET /api/auth/google/url` and `GET /api/auth/google/link-url` build the Google consent URL (`accounts.google.com/o/oauth2/v2/auth`).
- `GET /api/auth/google/callback` exchanges the code via `services/google-oauth.service.ts#exchangeGoogleToken`, verifies the ID token with `OAuth2Client.verifyIdToken`, then finds/creates a `User` (linking `googleId`).
- `POST /api/auth/google` does the same for the `@react-oauth/google` popup credential flow.
- Apple Sign-In (`/api/auth/apple`) also supported. JWT issued with `JWT_SECRET` (`utils/jwtConfig.ts`).

## Module Map (top-level `src/`)

| Area | Path |
|------|------|
| Express entry / middleware mount | `src/server/index.ts` |
| Auth & RBAC | `src/server/routes/auth.ts`, `src/server/middleware/auth.ts` |
| CRM core | `leads.ts`, `deals.ts`, `contacts.ts`, `pipelines.ts`, `crm-invoices.ts` |
| Automation / n8n | `routes/automation.ts`, `services/event-bus.service.ts`, `workers/*` |
| AI / AVA | `services/ai.service.ts`, `ava-intelligence.service.ts`, `ai-gateway.service.ts`, `routes/ava.ts`, `routes/intelligence.ts` |
| Messaging | `whatsapp.ts`, `whatsapp-send-router.service.ts`, `evolution.service.ts`, `email*.ts`, `sms.service.ts` |
| Integrations | `integrations.ts`, `google-business.ts`, `meta-leads.ts`, `indiamart-*.ts`, `social-*.ts` |
| Webhooks | `webhooks.ts`, `webhooks/meta-leads` (inbound, signature-verified) |
| Admin / Ops | `admin-queues.ts`, `super-admin.ts`, `status-health.ts`, `monitoring.ts` |
| Workers | `workers/index.ts` + `*.worker.ts` (BullMQ) |
| Frontend | `src/` (React app), `mobile-app/` (Capacitor), `components/`, `services/`, `contexts/` |

See `N8N_ARCHITECTURE.md`, `AUTOMATION.md`, `AI_ARCHITECTURE.md`, `API.md`, `DATABASE.md` for detail.
