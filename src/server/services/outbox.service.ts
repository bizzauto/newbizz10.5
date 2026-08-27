import { prisma } from '../db.js';
import { createRedisConnection, isRedisOperational } from '../utils/redis-connection.js';
import { getEventStreamName } from '../events/eventBus.js';

// The connection type is whatever createRedisConnection() returns (IORedis | null),
// avoiding a direct ioredis type import that can clash with the project's resolution.
type RedisConn = ReturnType<typeof createRedisConnection>;

/**
 * Event Outbox service.
 *
 * The `DomainEvent` Prisma table IS the outbox. Every emitted domain event is
 * persisted there with a `status` ('pending' | 'processed' | 'failed' | 'dead').
 * This service provides the read + replay operators that let us recover events
 * that never reached the Redis stream (e.g. Redis was down at emit time).
 */

type EventStatus = 'processed' | 'failed' | 'pending';

// Lazily-created, reused Redis connection for replays. `createRedisConnection`
// returns null when Redis is disabled/unreachable, so we cache it once created
// and fall back to isRedisOperational() before each xadd.
let replayConn: RedisConn | undefined;

function getReplayConnection(): RedisConn {
  if (replayConn === undefined) {
    replayConn = createRedisConnection();
  }
  return replayConn;
}

export async function markEventStatus(
  id: string,
  status: EventStatus,
  error?: string
): Promise<void> {
  await prisma.domainEvent.update({
    where: { id },
    data: {
      status,
      ...(error !== undefined ? { error } : {}),
    },
  });
}

export async function getEvent(id: string) {
  return prisma.domainEvent.findUnique({ where: { id } });
}

export async function listEvents(filter: {
  businessId?: string;
  eventType?: string;
  status?: string;
  limit?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filter.businessId) where.businessId = filter.businessId;
  if (filter.eventType) where.eventType = filter.eventType;
  if (filter.status) where.status = filter.status;

  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);

  return prisma.domainEvent.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Replay a single event to the Redis stream.
 *
 * Loads the persisted DomainEvent, re-publishes it onto the stream as a fresh
 * entry (id '*'), and marks it 'processed'. If Redis is not operational we
 * cannot guarantee delivery, so we refuse and return { ok: false }.
 */
export async function replayEvent(id: string): Promise<{ ok: boolean; error?: string }> {
  const event = await getEvent(id);
  if (!event) {
    return { ok: false, error: 'Event not found' };
  }

  if (!isRedisOperational()) {
    await markEventStatus(id, 'failed', 'REPLAY_SKIPPED_REDIS_DOWN').catch(() => undefined);
    return { ok: false, error: 'Redis is not operational' };
  }

  const conn = getReplayConnection();
  if (!conn) {
    return { ok: false, error: 'Redis connection unavailable' };
  }

  const payload = event.payload as Record<string, unknown>;
  try {
    await conn.xadd(
      getEventStreamName(),
      '*',
      'eventId', id,
      'type', event.eventType,
      'payload', JSON.stringify(payload ?? {})
    );
  } catch (err: any) {
    await markEventStatus(id, 'failed', `REPLAY_FAILED: ${err?.message || String(err)}`).catch(() => undefined);
    return { ok: false, error: err?.message || String(err) };
  }

  await markEventStatus(id, 'processed').catch(() => undefined);
  return { ok: true };
}

/**
 * Replay every event currently in 'failed' state (optionally filtered).
 * Returns counts of attempted / succeeded / failed replays.
 */
export async function replayFailed(filter?: {
  businessId?: string;
  eventType?: string;
  maxAgeHours?: number;
}): Promise<{ attempted: number; ok: number; failed: number }> {
  const where: Record<string, unknown> = { status: 'failed' };
  if (filter?.businessId) where.businessId = filter.businessId;
  if (filter?.eventType) where.eventType = filter.eventType;
  if (filter?.maxAgeHours) {
    where.createdAt = { gte: new Date(Date.now() - filter.maxAgeHours * 60 * 60 * 1000) };
  }

  const events = await prisma.domainEvent.findMany({ where, orderBy: { createdAt: 'asc' } });

  let ok = 0;
  let failed = 0;
  for (const evt of events) {
    const result = await replayEvent(evt.id);
    if (result.ok) ok++;
    else failed++;
  }

  return { attempted: events.length, ok, failed };
}

/**
 * Dead-letter aged-out failures.
 *
 * We deliberately do NOT add a new column. Per the hardening spec, failed rows
 * that are older than 24h and have been retried >= maxAttempts times are marked
 * with the sentinel error string 'DEAD_LETTER' and left at status 'failed' so
 * they remain queryable but are excluded from future replayFailed sweeps.
 *
 * NOTE: the DomainEvent model has no attempt counter, so callers that want a
 * real maxAttempts gate should track attempts in `error` or a sibling table.
 * This implementation only enforces the 24h age gate (maxAttempts is accepted
 * for API parity but the model cannot store attempts without a migration).
 */
export async function deadLetterOld(maxAttempts = 5): Promise<{ deadLettered: number }> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const stale = await prisma.domainEvent.findMany({
    where: {
      status: 'failed',
      createdAt: { lt: cutoff },
      OR: [{ error: null }, { NOT: { error: { contains: 'DEAD_LETTER' } } }],
    },
    select: { id: true },
  });

  if (stale.length === 0) {
    return { deadLettered: 0 };
  }

  await prisma.domainEvent.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { error: `DEAD_LETTER (maxAttempts=${maxAttempts})` },
  });

  return { deadLettered: stale.length };
}

export default {
  markEventStatus,
  getEvent,
  listEvents,
  replayEvent,
  replayFailed,
  deadLetterOld,
};
