import crypto from 'crypto';
import { Queue } from 'bullmq';
import { prisma } from '../db.js';
import { createRedisConnection } from '../utils/redis-connection.js';
import logger from '../utils/logger.js';

/**
 * Meta (Facebook/Instagram) Lead Ads ingestion.
 *
 * Webhook flow:
 *   Meta POST -> signature verify -> page_id -> Business lookup
 *   -> Graph API lead fetch -> enqueue into 'lead-processing' queue
 *   -> existing LeadCapture worker dedupes + creates contact.
 *
 * Idempotency: Graph leadgen_id is passed through as externalId so
 * LeadCaptureService upserts instead of duplicating contacts.
 */

let leadQueue: Queue | null = null;

function getLeadQueue(): Queue | null {
  if (leadQueue) return leadQueue;
  const conn = createRedisConnection({ bullMQ: true });
  if (!conn) return null;
  leadQueue = new Queue('lead-processing', {
    connection: conn,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 604800, count: 5000 },
    },
  });
  return leadQueue;
}

export function verifyMetaSignature(req: any): boolean {
  const secret = process.env.META_APP_SECRET;
  const header = req.headers['x-hub-signature-256'] as string | undefined;
  if (!secret || !header) return false;
  // Prefer true raw bytes when a parser captured them; otherwise fall back to
  // deterministic re-serialization of the parsed body (Meta sends compact JSON).
  const raw: Buffer | string | undefined = req.rawBody ?? (req.body ? JSON.stringify(req.body) : undefined);
  if (!raw) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header.replace(/^sha256=/, '')));
  } catch {
    return false;
  }
}

interface MappedLead {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
}

function mapFieldData(fieldData: any[]): MappedLead {
  const out: MappedLead = {};
  for (const f of fieldData || []) {
    const value = Array.isArray(f.values) ? f.values[0] : f.value;
    if (!value) continue;
    switch ((f.name || '').toLowerCase()) {
      case 'full_name':
      case 'name':
        out.name = value;
        break;
      case 'phone_number':
      case 'phone':
        out.phone = value;
        break;
      case 'email':
        out.email = value;
        break;
      case 'city':
        out.city = value;
        break;
    }
  }
  return out;
}

async function fetchLeadFromGraph(leadgenId: string, pageToken: string): Promise<MappedLead & { raw?: any }> {
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return { ...mapFieldData(data.field_data), raw: data };
}

/**
 * Handle one leadgen change. Never throws for business-mapping misses
 * (logged + skipped); throws only for retryable provider failures.
 */
export async function ingestLeadgenChange(change: any): Promise<'processed' | 'skipped'> {
  const value = change?.value || {};
  const pageId: string | undefined = value.page_id;
  const leadgenId: string | undefined = value.leadgen_id;
  const formId: string | undefined = value.form_id;

  if (!pageId || !leadgenId) {
    logger.warn('[MetaLeads] Ignoring malformed leadgen change (missing ids)');
    return 'skipped';
  }

  const business = await prisma.business.findFirst({
    where: { fbPageId: pageId },
    select: { id: true, fbAccessToken: true },
  });
  if (!business) {
    logger.warn(`[MetaLeads] No business mapped to page ${pageId} — skipping lead ${leadgenId}`);
    return 'skipped';
  }
  if (!business.fbAccessToken) {
    logger.warn(`[MetaLeads] Business ${business.id} has no fbAccessToken — cannot fetch lead ${leadgenId}`);
    return 'skipped';
  }

  // Decrypt via existing helper (single source of truth for token handling)
  const { getFacebookCredentials } = await import('./facebook.service.js');
  const { accessToken } = await getFacebookCredentials(business.id);

  const lead = await fetchLeadFromGraph(leadgenId, accessToken);

  const queue = getLeadQueue();
  if (!queue) {
    logger.warn('[MetaLeads] Redis unavailable — lead dropped (worker disabled)');
    return 'skipped';
  }

  await queue.add(
    'meta_lead',
    {
      businessId: business.id,
      source: 'facebook_ads',
      leadData: {
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        form_id: formId,
        ad_id: value.ad_id,
        campaign_id: value.campaign_id,
        leadgen_id: leadgenId,
      },
    },
    { jobId: `meta-lead:${leadgenId}` } // BullMQ dedupes repeated webhooks
  );

  logger.info(`[MetaLeads] Queued lead ${leadgenId} for business ${business.id}`);
  return 'processed';
}
