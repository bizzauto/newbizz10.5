# Disaster Recovery — BIZZ CRM

Procedures for backing up and restoring the production BIZZ CRM (Postgres + Redis). Replace env values from your deployment secret store; never commit them.

## 1. Components in scope
- **PostgreSQL** — primary datastore (`prisma/schema.prisma`, ~146 models). Source of truth.
- **Redis** — queues (BullMQ) + cache + `bizz:events` event stream. Rebuildable from DB; not backed up as source of truth.
- **Object storage** — uploaded media (avatars, posters, attachments) referenced by URLs in DB. Backup separately if not on S3/CDN.
- **n8n** — self-hosted instance + imported workflows (`src/server/n8n-workflows/*.json` are the canonical templates; re-import from repo).

## 2. Backup strategy

### PostgreSQL (primary)
Use `pg_dump` (logical) scheduled via cron on the DB host or Coolify scheduled task:

```bash
# Daily full dump, compressed
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
  -Fc -Z9 -f "/backups/bizz_$(date +%F).dump"

# Optional: continuous WAL archiving / managed PITR on the DB provider
```

- Store dumps in off-host object storage (S3-compatible) with lifecycle rules.
- `prisma migrate deploy` is the supported schema-restore path; pair dump with the migration folder in the repo tag.

### Redis
BullMQ queues are ephemeral by design (`removeOnComplete`/`removeOnFail` in `workers/index.ts`). Redis persistence (`appendonly yes`, RDB snapshots) is sufficient for in-flight job recovery; full backup not required if DB is authoritative.

## 3. Retention
| Backup | Frequency | Retention |
|--------|-----------|-----------|
| Full DB dump | Daily 02:00 | 30 daily + 12 monthly + 2 yearly |
| WAL / PITR | Continuous | 7–14 days |
| Redis RDB | Every 6h | 3 days |
| n8n workflow JSON | On change (commit to repo) | indefinite (git) |

## 4. RPO / RTO targets
| Objective | Target | Current basis |
|-----------|--------|---------------|
| RPO (data loss) | ≤ 15 min | WAL archiving or 15-min dump delta; document provider capability |
| RTO (restore) | ≤ 4 h | Restore `pg_dump` + `prisma migrate deploy` + `npm run worker` |

> These are targets; validate against your actual managed-Postgres plan. The code provides no built-in PITR — it relies on the DB host.

## 5. Restore test procedure (run quarterly)
1. Provision a scratch Postgres (same major version).
2. `pg_restore -h scratch -U $USER -d $DB_NAME /backups/bizz_<date>.dump`
3. `cp .env.example .env` with scratch values; `npx prisma migrate deploy` (or `prisma db push` for parity).
4. Start API: `npm run start`; start worker: `npm run worker`.
5. Hit `/health` and `/ready`; run `curl /api/metrics` for a known business.
6. Spot-check: create a Contact via `POST /api/leads`, confirm it persists and a `DomainEvent` row appears (`src/server/events/eventBus.ts`).
7. Re-run n8n import from `src/server/n8n-workflows/` and confirm one webhook workflow active.
8. Record restore duration; compare to RTO. Wipe scratch.

## 6. Encryption & secrets
- DB connection uses TLS (`sslmode=require`) on managed Postgres.
- Backups at rest: object storage SSE; dumps may be additionally `gpg`-encrypted with `ENCRYPTION_KEY` (AES-256-GCM used at app layer for tokens, `utils/encryption.ts`).
- Secrets (`DB_PASSWORD`, `N8N_API_KEY`, `OPENROUTER_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`) live in Coolify env / secret manager only — never in repo or dumps.

## 7. Roles & runbook
- Owner: platform/SRE. Escalation: `#bizz-ops` (see `ops-ticket-dispatch.json`).
- Drill logs: keep last 4 restore tests in this file's appendix (add after each drill).
