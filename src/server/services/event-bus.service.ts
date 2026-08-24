import { prisma } from '../db.js';
import logger from '../utils/logger.js';

/**
 * Central Event Bus (Master Prompt §4).
 *
 * - Persisted: every emission stored in DomainEvent (audit + trace).
 * - Idempotent: duplicate idempotencyKey -> recorded as "duplicate", handlers skipped.
 * - Tenant-aware: businessId carried on every event.
 * - Extensible: registerEventTypeHandler(type, handler) — handlers run
 *   sequentially, one failure never blocks others.
 */

type Handler = (payload: any, meta: { businessId?: string; eventId: string }) => Promise<void>;

const handlers = new Map<string, Handler[]>();

export function registerEventHandler(eventType: string, handler: Handler): void {
  const list = handlers.get(eventType) || [];
  list.push(handler);
  handlers.set(eventType, list);
}

export async function emitEvent(
  eventType: string,
  payload: any,
  opts: { businessId?: string; idempotencyKey?: string } = {}
): Promise<{ eventId: string; duplicate: boolean }> {
  // Idempotency check first (unique constraint backstop below)
  if (opts.idempotencyKey) {
    const existing = await prisma.domainEvent.findUnique({
      where: { idempotencyKey: opts.idempotencyKey },
      select: { id: true },
    });
    if (existing) return { eventId: existing.id, duplicate: true };
  }

  const event = await prisma.domainEvent.create({
    data: {
      eventType,
      businessId: opts.businessId,
      payload: payload as any,
      idempotencyKey: opts.idempotencyKey,
    },
  });

  const list = handlers.get(eventType) || [];
  for (const h of list) {
    try {
      await h(payload, { businessId: opts.businessId, eventId: event.id });
    } catch (err: any) {
      logger.error(`[EventBus] handler failed for ${eventType}: ${err?.message}`);
      await prisma.domainEvent.update({
        where: { id: event.id },
        data: { status: 'partial_error', error: String(err?.message || err).slice(0, 500) },
      }).catch(() => {});
    }
  }
  return { eventId: event.id, duplicate: false };
}

/** Built-in wiring: keep this minimal; heavy logic belongs in services. */
export function registerCoreEventHandlers(): void {
  // lead.created -> audit trail already via DomainEvent persistence itself.
  // Additional subscribers can be attached here as the automation engine grows:
  // e.g. registerEventHandler('payment.failed', notifyBillingTeam)
}
