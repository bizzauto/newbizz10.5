# Database — BIZZ CRM

PostgreSQL + **Prisma 5** (`prisma/schema.prisma`). ~146 models. Migrations applied via `prisma migrate deploy` at startup.

## Connection
`src/server/db.ts`:
- `PrismaClient` with `log: ['error','warn']` (+ `query` when `SLOW_QUERY_LOG_ENABLED=true` & `production`).
- Pool: appends `connection_limit` (from `DB_POOL_SIZE`) and `pool_timeout=10` to `DATABASE_URL`.
- Use `DB_POOL_SIZE` to right-size per container (default pgbouncer-style; avoid exceeding DB max_connections across replicas).

## Multi-tenancy via `businessId`
- Every tenant is a `Business` row.
- Almost all models carry `businessId String` with `@@index([businessId])` for tenant-scoped queries.
- Enforcement: service/route code always filters `where: { businessId: req.user.businessId }`; `businessId` comes from JWT (`middleware/auth.ts#requireBusinessAccess`), never request body.
- `User.businessId` links staff; `SUPER_ADMIN` bypasses scoping.
- `DomainEvent.businessId` records event ownership (`events/eventBus.ts`).

## Key models (representative)
| Area | Models |
|------|--------|
| Tenant | `Business`, `User`, `BusinessMember`, `CustomRole` |
| CRM | `Contact`, `Lead`, `Deal`, `Pipeline`, `Stage`, `Activity`, `LeadScore` |
| Comms | `Conversation`, `Message`, `ScheduledMessage`, `Notification`, `DeviceToken` |
| Campaigns | `Campaign`, `Post` (social), `TriggerLink` |
| Billing | `Subscription`, `Invoice`/`Document`, `Wallet`, `Transaction`, `PaymentLink` |
| AI | `AiUsageLog`, `Ava*`, `Intelligence*` |
| Automation | `Workflow`, `Automation`, `DomainEvent`, `Webhook` |
| Social | `SocialAccount`, `Post`, platform tokens on `Business` (`fbAccessToken`, `igAccessToken`, …) |
| Reviews | `Review`, `ReviewRequest` |
| Audit | `AuditLog`, `Activity`, `SecurityIncident` |

## Indexes
- `businessId` indexed on tenant entities (standard).
- Hot query paths (verify in schema): `contact(businessId, source)`, `domainEvent(businessId, eventType, createdAt)`, `scheduledMessage(status, scheduledAt)`, `post(status, scheduledAt)`, `campaign(status, scheduledAt)` — the dispatchers in `workers/index.ts` scan these every 60s, so index them.
- Add composite indexes for any report `groupBy` in `routes/metrics.ts` if slow.

## Encryption at rest (app layer)
- Sensitive tokens (WhatsApp/GBP/social) stored encrypted (AES-256-GCM) via `utils/encryption.ts`; decrypted at use (`workers/index.ts#publishTo*`).
- DB-level encryption (TLS in transit, disk encryption) provided by managed Postgres.

## Connection pool / scaling
- Stateless API + Redis queues allow horizontal API replicas.
- Watch `pool_timeout=10`: if saturated, raise `DB_POOL_SIZE` or add pgbouncer; monitor `db` latency in `/health` (>1000ms → `degraded`).
- `db-pool.ts` route exposes pool stats for debugging.

## Maintenance
- `prisma migrate deploy` on deploy; `audit-retention.ts` prunes old audit rows (confirm job runs).
- Backups: `DISASTER_RECOVERY.md`. Never `prisma db push` in prod without a dump.
