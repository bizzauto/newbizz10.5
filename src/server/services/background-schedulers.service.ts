/**
 * Background Schedulers — drains time-based feature queues that previously
 * had NO drainer (rows were created but never processed):
 *
 *   1. DripQueue            — drip campaign steps with sendAt <= now
 *   2. AppointmentReminder  — pending reminders with scheduledAt <= now
 *   3. CartRecovery         — abandoned carts due for automated follow-ups
 *
 * All sends route through WhatsAppSendRouter (anti-ban delay + rotation for
 * campaign sends apply automatically). Every tick is fail-open: one bad row
 * never blocks the rest.
 */
import { prisma } from '../db.js';
import { WhatsAppSendRouter } from './whatsapp-send-router.service.js';
import { spinAndPersonalize } from '../utils/spintax.js';

const TICK_MS = 60_000;          // drip + reminders: every minute
const CART_TICK_MS = 15 * 60_000; // cart recovery: every 15 min
const BATCH = 50;

// ─────────────────────────── 1. DRIP QUEUE ───────────────────────────

export async function dripQueueTick(): Promise<number> {
  const due = await prisma.dripQueue.findMany({
    where: { status: 'pending', sendAt: { lte: new Date() } },
    include: {
      campaign: { select: { id: true, name: true, businessId: true, dripSteps: true, content: true, status: true } },
      contact: { select: { id: true, phone: true, name: true } },
    },
    orderBy: { sendAt: 'asc' },
    take: BATCH,
  });
  if (due.length === 0) return 0;

  let sent = 0;
  for (const item of due) {
    try {
      const campaign = item.campaign;
      const contact = item.contact;
      if (!campaign || campaign.status === 'paused' || campaign.status === 'draft') {
        await prisma.dripQueue.update({ where: { id: item.id }, data: { status: 'cancelled', error: `Campaign ${campaign?.status || 'missing'}` } });
        continue;
      }
      if (!contact?.phone) {
        await prisma.dripQueue.update({ where: { id: item.id }, data: { status: 'failed', error: 'Contact has no phone' } });
        continue;
      }

      // Step message: step.message || campaign.content.message || campaign name
      let steps: any[] = [];
      try { steps = campaign.dripSteps ? JSON.parse(campaign.dripSteps as string) : []; } catch { steps = []; }
      const step = steps[item.step] || {};
      const content = (campaign.content as any) || {};
      const template = step.message || content.message || campaign.name;
      const rendered = spinAndPersonalize(template, { name: contact.name, phone: contact.phone });

      await WhatsAppSendRouter.sendText(campaign.businessId, contact.phone, rendered, {
        contactId: contact.id,
        rotate: true, // campaign context → number rotation applies
      });

      await prisma.dripQueue.update({ where: { id: item.id }, data: { status: 'sent', sentAt: new Date() } });
      sent++;
    } catch (err: any) {
      const failures = ((item as any)._failCount || 0) + 1;
      // Hard-fail rows older than 7 days past due; soft-fail otherwise (retry next tick)
      const overdueMs = Date.now() - new Date(item.sendAt).getTime();
      if (overdueMs > 7 * 24 * 3600_000) {
        await prisma.dripQueue.update({ where: { id: item.id }, data: { status: 'failed', error: err?.message?.slice(0, 500) } });
      } else {
        console.warn(`[DripDrainer] ${item.id} failed (will retry):`, err?.message);
      }
    }
  }
  if (sent > 0) console.log(`[DripDrainer] sent ${sent}/${due.length} drip step(s)`);
  return sent;
}

// ────────────────────── 2. APPOINTMENT REMINDERS ──────────────────────

/** Actually send a reminder. Shared by the drainer AND the manual /send route
 *  (which previously only flipped status in the DB without sending anything). */
export async function sendAppointmentReminderNow(reminderId: string): Promise<{ ok: boolean; error?: string }> {
  const reminder = await prisma.appointmentReminder.findUnique({
    where: { id: reminderId },
    include: { contact: { select: { phone: true, name: true, email: true } } },
  });
  if (!reminder) return { ok: false, error: 'Reminder not found' };

  const rendered = spinAndPersonalize(reminder.message, {
    name: reminder.contact?.name || null,
  });

  try {
    if (reminder.channel === 'whatsapp' && reminder.contact?.phone) {
      await WhatsAppSendRouter.sendText(reminder.businessId, reminder.contact.phone, rendered, {
        contactId: reminder.contactId || undefined,
      });
    } else if (reminder.channel === 'email' && reminder.contact?.email) {
      const { EmailService } = await import('./email.service.js');
      await EmailService.sendEmail(
        reminder.contact.email,
        'Appointment Reminder',
        `<p>${rendered.replace(/\n/g, '<br/>')}</p>`
      );
    } else {
      return { ok: false, error: `No valid ${reminder.channel} contact info` };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Send failed' };
  }

  await prisma.appointmentReminder.update({
    where: { id: reminder.id },
    data: { status: 'sent', sentAt: new Date() },
  });
  return { ok: true };
}

export async function appointmentReminderTick(): Promise<number> {
  const due = await prisma.appointmentReminder.findMany({
    where: { status: 'pending', scheduledAt: { lte: new Date() } },
    orderBy: { scheduledAt: 'asc' },
    take: BATCH,
  });
  if (due.length === 0) return 0;

  let sent = 0;
  for (const reminder of due) {
    // Stale guard: >7 days past due = give up (bad data / deleted appointment)
    const overdueMs = Date.now() - new Date(reminder.scheduledAt).getTime();
    if (overdueMs > 7 * 24 * 3600_000) {
      await prisma.appointmentReminder.update({ where: { id: reminder.id }, data: { status: 'failed' } });
      continue;
    }
    const res = await sendAppointmentReminderNow(reminder.id);
    if (res.ok) sent++;
    else if (res.error?.includes('No valid')) {
      // Permanent — never retry
      await prisma.appointmentReminder.update({ where: { id: reminder.id }, data: { status: 'failed' } });
    } else {
      console.warn(`[ReminderDrainer] ${reminder.id} failed (will retry):`, res.error);
    }
  }
  if (sent > 0) console.log(`[ReminderDrainer] sent ${sent}/${due.length} reminder(s)`);
  return sent;
}

// ─────────────────────── 3. CART RECOVERY ───────────────────────

const CART_MAX_REMINDERS = 3;
const CART_REMIND_GAP_MS = 24 * 3600_000; // 1 reminder per day, max 3

export async function cartRecoveryTick(): Promise<number> {
  const now = new Date();
  const carts = await prisma.cartRecovery.findMany({
    where: {
      status: 'abandoned',
      contactId: { not: null },
      reminderCount: { lt: CART_MAX_REMINDERS },
      OR: [
        { lastReminderAt: null },
        { lastReminderAt: { lte: new Date(now.getTime() - CART_REMIND_GAP_MS) } },
      ],
    },
    include: { contact: { select: { phone: true, name: true, email: true } } },
    orderBy: { updatedAt: 'asc' },
    take: BATCH,
  });
  if (carts.length === 0) return 0;

  let sent = 0;
  for (const cart of carts) {
    const contact = cart.contact;
    if (!contact?.phone) continue;

    // Cart must be at least 1h old before the FIRST automated reminder
    const cartAgeMs = now.getTime() - new Date(cart.createdAt).getTime();
    if (cart.reminderCount === 0 && cartAgeMs < 3600_000) continue;

    const cartItems = (cart.cartItems as any[]) || [];
    const itemCount = cartItems.length;
    const itemSummary = cartItems.slice(0, 3).map((i: any) => i.name || 'Item').join(', ');
    const moreItems = itemCount > 3 ? ` and ${itemCount - 3} more` : '';
    const message = spinAndPersonalize(
      `Hi {name}! {Just a reminder|Quick heads-up} — you left ${itemCount} item${itemCount > 1 ? 's' : ''} in your cart (${itemSummary}${moreItems}) worth ₹${cart.cartValue.toFixed(2)}. {Complete your purchase now!|Your cart is waiting — grab it now!|Finish your order before it expires!}`,
      { name: contact.name, phone: contact.phone }
    );

    try {
      await WhatsAppSendRouter.sendText(cart.businessId, contact.phone, message, { contactId: cart.contactId || undefined });
      await prisma.cartRecovery.update({
        where: { id: cart.id },
        data: { reminderCount: { increment: 1 }, lastReminderAt: now },
      });
      sent++;
    } catch (err: any) {
      console.warn(`[CartDrainer] ${cart.id} failed:`, err?.message);
    }
  }
  if (sent > 0) console.log(`[CartDrainer] sent ${sent}/${carts.length} recovery reminder(s)`);
  return sent;
}

// ─────────────────────── 4. STOCK ALERTS (back in stock) ───────────────────────

export async function stockAlertTick(): Promise<number> {
  // Pending alerts whose product is back in stock → notify the customer
  const alerts = await prisma.stockAlert.findMany({
    where: { status: 'pending' },
    include: { product: { select: { name: true, quantity: true } } },
    orderBy: { createdAt: 'asc' },
    take: BATCH,
  });
  if (alerts.length === 0) return 0;

  let sent = 0;
  for (const alert of alerts) {
    const product = alert.product as { name: string; quantity: number } | null;
    if (!product) {
      await prisma.stockAlert.update({ where: { id: alert.id }, data: { status: 'failed' } });
      continue;
    }
    // Only notify when the product actually has stock again
    if (product.quantity <= 0) continue;

    const productName = product.name || 'The product';
    const message = `Good news! "${productName}" is {back in stock|available again} — order now before it runs out!`;
    let delivered = false;

    try {
      if (alert.contactId || alert.customerPhone) {
        let phone = alert.customerPhone || '';
        if (!phone && alert.contactId) {
          const c = await prisma.contact.findUnique({ where: { id: alert.contactId }, select: { phone: true, name: true } });
          if (c?.phone) phone = c.phone;
        }
        if (phone) {
          await WhatsAppSendRouter.sendText(alert.businessId, phone, message, {
            contactId: alert.contactId || undefined,
          });
          delivered = true;
        }
      }
      if (!delivered && alert.customerEmail) {
        const { EmailService } = await import('./email.service.js');
        await EmailService.sendEmail(
          alert.customerEmail,
          `Back in stock: ${productName}`,
          `<p>Good news! <strong>${productName}</strong> is back in stock. Order now!</p>`
        );
        delivered = true;
      }
    } catch (err: any) {
      console.warn(`[StockAlertDrainer] ${alert.id} failed:`, err?.message);
      // permanent contact-less row — fail it so it stops being retried
      if (err?.message?.includes('not configured')) {
        await prisma.stockAlert.update({ where: { id: alert.id }, data: { status: 'failed' } });
      }
      continue;
    }

    if (delivered) {
      await prisma.stockAlert.update({ where: { id: alert.id }, data: { status: 'notified', notifiedAt: new Date() } });
      sent++;
    }
  }
  if (sent > 0) console.log(`[StockAlertDrainer] notified ${sent} customer(s)`);
  return sent;
}

// ─────────────────────── SCHEDULER BOOT ───────────────────────

let started = false;
export function startBackgroundSchedulers(): void {
  if (started) return;
  started = true;

  const runTicks = async () => {
    try { await dripQueueTick(); } catch (e: any) { console.warn('[DripDrainer] tick:', e?.message); }
    try { await appointmentReminderTick(); } catch (e: any) { console.warn('[ReminderDrainer] tick:', e?.message); }
  };
  const runCartTick = async () => {
    try { await cartRecoveryTick(); } catch (e: any) { console.warn('[CartDrainer] tick:', e?.message); }
  };
  const runStockTick = async () => {
    try { await stockAlertTick(); } catch (e: any) { console.warn('[StockAlertDrainer] tick:', e?.message); }
  };

  // First pass shortly after boot, then intervals (unref so shutdown is clean)
  setTimeout(runTicks, 20_000).unref?.();
  setInterval(runTicks, TICK_MS).unref?.();
  setTimeout(runCartTick, 90_000).unref?.();
  setInterval(runCartTick, CART_TICK_MS).unref?.();
  setTimeout(runStockTick, 120_000).unref?.();
  setInterval(runStockTick, CART_TICK_MS).unref?.();

  console.log('[BackgroundSchedulers] started — drip (60s), reminders (60s), cart recovery (15min), stock alerts (15min)');
}
