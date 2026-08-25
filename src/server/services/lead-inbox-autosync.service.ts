import { prisma } from '../db.js';
import { Prisma } from '@prisma/client';
import logger from '../utils/logger.js';
import { GmailIMAPService } from './gmail-imap.service.js';

/**
 * Lead Inbox Autosync — automatic JustDial / IndiaMART lead ingestion
 * from a connected Gmail inbox.
 *
 * Per-business opt-in config stored on Business.leadInboxConfig (Json):
 * {
 *   "enabled": true,
 *   "imap": { "email": "...", "password": "app-password", "host": "imap.gmail.com", "port": 993 },
 *   "platform": "justdial" | "indiamart",
 *   "intervalMinutes": 15   // optional override
 * }
 *
 * Leads are captured through LeadCaptureService upserts, so re-scanning the
 * same emails is idempotent (no duplicate contacts for known phone/email).
 */

const DEFAULT_INTERVAL_MIN = 15;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startLeadInboxAutosync(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => logger.error(`[LeadInbox] tick failed: ${err?.message}`));
  }, DEFAULT_INTERVAL_MIN * 60 * 1000);
  // First pass shortly after boot (let DB/Redis settle)
  setTimeout(() => tick().catch(() => {}), 45_000);
  logger.info('[LeadInbox] Inbox autosync poller started (every 15 min)');
}

export function stopLeadInboxAutosync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const businesses = await prisma.business.findMany({
      where: { leadInboxConfig: { not: Prisma.DbNull } },
      select: { id: true, name: true, leadInboxConfig: true },
      take: 100,
    });

    for (const b of businesses) {
      const cfg: any = b.leadInboxConfig;
      if (!cfg?.enabled || !cfg?.imap?.email || !cfg?.imap?.password) continue;

      const intervalMin = Number(cfg.intervalMinutes) || DEFAULT_INTERVAL_MIN;
      // Cheap per-business throttle using updatedAt marker inside config
      const lastRunMs = Number(cfg._lastRunAt || 0);
      if (Date.now() - lastRunMs < intervalMin * 60_000 - 30_000) continue;

      try {
        const res = await GmailIMAPService.fetchAndCreateLeads(
          b.id,
          { email: String(cfg.imap.email), password: String(cfg.imap.password) },
          { days: 1, platform: cfg.platform || 'justdial' }
        );
        await prisma.business.update({
          where: { id: b.id },
          data: {
            leadInboxConfig: { ...cfg, _lastRunAt: Date.now(), _lastResult: { leads: res.leadsCreated, errors: res.errors.slice(0, 3) } } as any,
          },
        });
        if (res.leadsCreated > 0) {
          logger.info(`[LeadInbox] ${b.name}: +${res.leadsCreated} leads (${cfg.platform || 'justdial'})`);
        }
      } catch (err: any) {
        logger.error(`[LeadInbox] ${b.name} sync failed: ${err?.message}`);
      }
    }
  } finally {
    running = false;
  }
}
