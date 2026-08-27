import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as XLSX from 'xlsx';
import { prisma } from '../db.js';
import logger from '../utils/logger.js';
import { createHash } from 'crypto';

/**
 * BullMQ queue for contact imports.
 *
 * NOTE: The queue is always instantiated so importing this module never
 * throws. If REDIS_ENABLED !== 'true' the worker (wired in worker.ts by the
 * coordinator) simply won't process jobs — the queue object is still valid.
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const importQueue = new Queue('contact-import', {
  connection: new IORedis(REDIS_URL, { maxRetriesPerRequest: null }),
});

/**
 * Maps a source-column header to a target Contact field.
 * e.g. { name: 'Full Name', phone: 'Mobile', email: 'Email', company: 'Org' }
 * Standard fields (name/phone/email) map to those columns; any other key is
 * treated as a custom field and stored in Contact.customFields.
 */
export interface ImportMapping {
  name?: string;
  phone?: string;
  email?: string;
  [k: string]: string | undefined;
}

/**
 * In-memory progress store keyed by jobId.
 * The worker updates this inside batchImport and the route reads it via
 * GET /api/import/contacts/:jobId/progress.
 */
export interface ImportProgress {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  done: boolean;
}

export const importProgress = new Map<string, ImportProgress>();

/**
 * Parse a CSV/Excel/JSON buffer into an array of row objects.
 * For .xlsx/.xls we use xlsx; for .csv we use a lightweight quoted-field parser.
 */
export async function parseFile(
  buffer: Buffer,
  ext: string
): Promise<Record<string, string>[]> {
  const lower = ext.toLowerCase();

  if (lower === '.xlsx' || lower === '.xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: '',
      raw: false,
    });
    return raw.map((row) => stringifyRow(row));
  }

  if (lower === '.csv') {
    return parseCsv(buffer.toString('utf8'));
  }

  // Fallback: attempt CSV parsing for unknown text extensions.
  return parseCsv(buffer.toString('utf8'));
}

/**
 * Convert every cell to a string (xlsx may return numbers/dates).
 */
function stringifyRow(row: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(row)) {
    const v = row[key];
    out[key] = v === null || v === undefined ? '' : String(v).trim();
  }
  return out;
}

/**
 * Minimal CSV parser supporting quoted fields, escaped quotes ("") and
 * commas/newlines inside quotes.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += c;
      }
    }
  }
  // flush trailing field/row
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const result: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0] === '') continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim();
    });
    result.push(obj);
  }
  return result;
}

/**
 * Return the union of header keys from the parsed rows.
 */
export async function detectColumns(
  rows: Record<string, string>[]
): Promise<string[]> {
  const cols = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key) cols.add(key);
    }
  }
  return Array.from(cols);
}

/**
 * Stable, deterministic id derived from businessId + dedupe key.
 * Using phone or email as the dedupe anchor means the same contact re-imported
 * into the same business produces the same id, so prisma.contact.upsert
 * updates instead of duplicating.
 */
function stableId(businessId: string, dedupeKey: string): string {
  return createHash('sha256')
    .update(`${businessId}::${dedupeKey}`)
    .digest('hex')
    .slice(0, 24);
}

/**
 * Batch-import rows into Contact, upserting by phone/email within the business.
 * Tracks progress in the module-level importProgress map.
 */
export async function batchImport(
  businessId: string,
  rows: Record<string, string>[],
  mapping: ImportMapping,
  jobId: string
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  importProgress.set(jobId, {
    total: rows.length,
    created,
    updated,
    skipped,
    done: false,
  });

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const nameVal = mapping.name ? row[mapping.name] : '';
      const phoneVal = mapping.phone ? row[mapping.phone] : '';
      const emailVal = mapping.email ? row[mapping.email] : '';

      const name = (nameVal || emailVal || phoneVal || 'Unknown Contact').trim();

      // Collect custom fields (any mapping key that isn't a standard field).
      const customFields: Record<string, string> = {};
      for (const key of Object.keys(mapping)) {
        if (key === 'name' || key === 'phone' || key === 'email') continue;
        const src = mapping[key];
        if (src && row[src] !== undefined) {
          customFields[key] = row[src];
        }
      }

      const dedupeKey = (phoneVal || emailVal || `row-${i}`).trim();
      if (!dedupeKey) {
        skipped++;
        continue;
      }
      const id = stableId(businessId, dedupeKey);

      const existing = await prisma.contact.findUnique({ where: { id } });
      const isUpdate = !!existing;

      const data = {
        businessId,
        name,
        phone: phoneVal || null,
        email: emailVal || null,
        tags: { set: Array.from(new Set([...(existing?.tags ?? []), 'imported'])) },
        ...(Object.keys(customFields).length > 0
          ? {
              customFields: {
                ...(existing?.customFields as object | undefined),
                ...customFields,
              },
            }
          : {}),
      } as const;

      await prisma.contact.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });

      if (isUpdate) updated++;
      else created++;
    } catch (err: any) {
      logger.error(`import ${jobId} row ${i} failed`, {
        error: err?.message,
      });
      skipped++;
    }

    if (i % 50 === 0 || i === rows.length - 1) {
      logger.info(`import ${jobId} progress ${created}/${rows.length}`);
      const p = importProgress.get(jobId);
      if (p) {
        p.created = created;
        p.updated = updated;
        p.skipped = skipped;
        importProgress.set(jobId, p);
      }
    }
  }

  importProgress.set(jobId, {
    total: rows.length,
    created,
    updated,
    skipped,
    done: true,
  });

  logger.info(
    `import ${jobId} complete created=${created} updated=${updated} skipped=${skipped}`
  );

  return { created, updated, skipped };
}
