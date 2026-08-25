import axios from 'axios';
import { prisma } from '../db.js';
import { createRedisConnection } from '../utils/redis-connection.js';
import { getEventStreamName } from './eventBus.js';

const STREAM = getEventStreamName();
const GROUP = 'n8n-sub';
const CONSUMER = 'api';
const BATCH = 10;
const BLOCK_MS = 5000;
const SLEEP_MS = 500;

let started = false;

async function ensureGroup(conn: any): Promise<void> {
  try {
    await conn.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
  } catch (err: any) {
    if (err?.message?.includes('BUSYGROUP')) return; // already exists
    throw err;
  }
}

async function forwardToN8n(event: {
  type: string;
  businessId: string;
  payload: any;
}): Promise<void> {
  const base = process.env.N8N_BASE_URL || process.env.N8N_URL;
  if (!base) return;

  // 1) Optional global catch-all webhook for ALL events
  const catchAll = process.env.N8N_EVENT_WEBHOOK;
  if (catchAll) {
    try {
      await axios.post(
        catchAll,
        { event: event.type, businessId: event.businessId, payload: event.payload },
        { timeout: 10000 }
      );
      console.log(`[EventSub] forwarded '${event.type}' to catch-all webhook`);
    } catch (e: any) {
      console.error(`[EventSub] catch-all forward failed:`, e.message);
    }
  }

  // 2) Per-event chatbotFlow rules (trigger = event type, has n8nWorkflowId)
  try {
    const flows = await prisma.chatbotFlow.findMany({
      where: { trigger: event.type, isActive: true },
    });
    for (const f of flows as any[]) {
      const wfId = (f as any).n8nWorkflowId;
      if (!wfId) continue;
      try {
        await axios.post(
          `${base.replace(/\/$/, '')}/webhook/${wfId}`,
          { event: event.type, businessId: event.businessId, payload: event.payload },
          { timeout: 10000 }
        );
        console.log(`[EventSub] triggered n8n workflow '${wfId}' for '${event.type}'`);
      } catch (e: any) {
        console.error(`[EventSub] workflow '${wfId}' failed:`, e.message);
      }
    }
  } catch (e: any) {
    console.error(`[EventSub] chatbotFlow lookup failed:`, e.message);
  }
}

async function loop(conn: any): Promise<void> {
  for (;;) {
    try {
      const res = await conn.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'COUNT', BATCH,
        'STREAMS', STREAM, '>'
      );
      if (res) {
        const [, entries] = res[0] as [string, any[]];
        for (const [id, fields] of entries) {
          try {
            const map: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) map[fields[i]] = fields[i + 1];
            const type = map.type || 'unknown';
            const businessId = map.businessId || '';
            let payload: any = {};
            try { payload = JSON.parse(map.payload || '{}'); } catch { /* ignore */ }
            await forwardToN8n({ type, businessId, payload });
          } catch (e: any) {
            console.error('[EventSub] message handling error:', e.message);
          } finally {
            await conn.xack(STREAM, GROUP, id).catch(() => {});
          }
        }
      } else {
        await new Promise((r) => setTimeout(r, SLEEP_MS));
      }
    } catch (err: any) {
      console.error('[EventSub] loop error:', err.message);
      await new Promise((r) => setTimeout(r, SLEEP_MS));
    }
  }
}

/**
 * Starts the background subscriber that forwards domain events to n8n.
 * Safe to call once at boot; no-ops if Redis is unavailable.
 */
export function startEventSubscriber(): void {
  if (started) return;
  const conn = createRedisConnection();
  if (!conn) {
    console.log('[EventSub] Redis not configured — event subscriber disabled');
    return;
  }
  started = true;
  ensureGroup(conn)
    .then(() => {
      console.log('[EventSub] started (stream: ' + STREAM + ')');
      loop(conn);
    })
    .catch((err) => {
      started = false;
      console.error('[EventSub] failed to start:', err?.message);
    });
}

export default { startEventSubscriber };
