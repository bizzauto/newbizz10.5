/**
 * Schema Drift Guard
 *
 * Detects and repairs missing critical tables at runtime, before cron jobs
 * and health checks touch them. This prevents the classic failure mode where
 * `_prisma_migrations` records a migration as "applied" but the table was
 * never actually created (partial apply / drift). `prisma migrate deploy`
 * then skips it forever, and the first query against the missing table throws
 * `relation "X" does not exist`.
 *
 * The guard runs once at startup (before startAuditPruneCron) and repairs any
 * drift it finds by applying the minimal DDL below. It is idempotent and safe
 * to run on every boot.
 *
 * Usage:
 *   import { ensureSchema } from '../services/schema-drift-guard.js';
 *   await ensureSchema();
 */

import { prisma } from '../db.js';

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Each entry maps a table name to the DDL required to create it.
 * DDL is derived from the canonical prisma/migrations SQL so it stays faithful
 * to the intended schema. Add new critical tables here as the schema grows.
 */
const CRITICAL_TABLES: Record<string, string[]> = {
  AuditLog: [
    `CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL,
      "businessId" TEXT NOT NULL,
      "action" TEXT NOT NULL,
      "entity" TEXT NOT NULL,
      "entityId" TEXT,
      "oldValues" JSONB,
      "newValues" JSONB,
      "description" TEXT,
      "userId" TEXT,
      "userEmail" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_businessId_idx" ON "AuditLog"("businessId")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_businessId_createdAt_idx" ON "AuditLog"("businessId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_businessId_action_idx" ON "AuditLog"("businessId", "action")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_businessId_entity_idx" ON "AuditLog"("businessId", "entity")`,
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_businessId_fkey'
       ) THEN
         ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_businessId_fkey"
           FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
       END IF;
     END $$`,
  ],
};

/**
 * Returns the set of expected tables that are currently missing from the
 * connected database's public schema.
 */
async function findMissingTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `;
  const existing = new Set(rows.map((r) => r.table_name));
  return Object.keys(CRITICAL_TABLES).filter((t) => !existing.has(t));
}

/**
 * Ensures all critical tables exist. Repairs any that are missing.
 * Never throws — logs and continues so a schema issue can't crash startup.
 */
export async function ensureSchema(): Promise<void> {
  if (NODE_ENV !== 'production') {
    return;
  }

  try {
    const missing = await findMissingTables();

    if (missing.length === 0) {
      console.log('[SchemaGuard] All critical tables present — no drift detected.');
      return;
    }

    console.warn(`[SchemaGuard] Detected missing tables: ${missing.join(', ')} — repairing...`);

    for (const table of missing) {
      const ddl = CRITICAL_TABLES[table];
      for (const statement of ddl) {
        try {
          await prisma.$executeRawUnsafe(statement);
        } catch (stmtErr: any) {
          // A non-fatal duplicate (e.g. index race) or FK constraint race
          // should not abort the rest. The table itself may already exist.
          const msg = String(stmtErr?.message || stmtErr);
          if (!/already exists|duplicate/i.test(msg)) {
            console.error(`[SchemaGuard] Statement failed for "${table}": ${msg}`);
          }
        }
      }
      // Verify the table actually exists now (CREATE TABLE is the first statement)
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM "${table}" LIMIT 1`);
        console.log(`[SchemaGuard] Repaired table "${table}".`);
      } catch (verifyErr: any) {
        console.error(`[SchemaGuard] Table "${table}" still missing after repair attempt: ${verifyErr?.message || verifyErr}`);
      }
    }

    console.log('[SchemaGuard] Schema drift repair complete.');
  } catch (err: any) {
    console.error('[SchemaGuard] Unable to verify/repair schema (non-fatal):', err?.message || err);
  }
}
