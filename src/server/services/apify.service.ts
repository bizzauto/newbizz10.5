/**
 * Apify BYOK Service
 *
 * Lets each business connect its OWN Apify account token (Settings ->
 * Integrations -> Apify). Their key is stored AES-256-GCM encrypted
 * (externalIntegration.apiKeyEncrypted) and only THIS business's key is
 * ever used for their runs — free-tier platform credits stay theirs.
 *
 * No new DB tables: runs live on Apify (status polled on demand), spend is
 * tracked in AiUsageLog (provider='apify'), imported rows go to contacts
 * with source='apify'.
 */
import axios from 'axios';
import { prisma } from '../db.js';
import { decryptData } from './data-encryption.service.js';

const APIFY_API = 'https://api.apify.com/v2';
const TERMINAL_STATUSES = ['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED'];
// Apify platform usage: 1 compute unit ~= $0.25 (docs quote; stored for audit)
const USD_PER_COMPUTE_UNIT = 0.25;

/** Actor id must look like owner/actor — blocks path-traversal-ish URLs */
const ACTOR_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._~-]*\/[A-Za-z0-9][A-Za-z0-9._~-]*$/;

export interface CuratedActor {
  id: string;
  name: string;
  category: string;
  description: string;
  sampleInput: Record<string, unknown>;
  // dataset field -> contact field hints shown in UI
  contactHints: string[];
}

/** Well-known actors useful for lead-gen / research inside the CRM */
export const APIFY_CURATED_ACTORS: CuratedActor[] = [
  {
    id: 'apify/google-maps-scraper',
    name: 'Google Maps Scraper',
    category: 'Lead Gen',
    description: 'Businesses by search + location: name, phone, website, reviews',
    sampleInput: { searchStringsArray: ['plumbers in Mumbai'], maxCrawledPlacesPerSearch: 20 },
    contactHints: ['title', 'phone', 'website', 'address', 'city', 'categoryName'],
  },
  {
    id: 'apify/instagram-scraper',
    name: 'Instagram Scraper',
    category: 'Social',
    description: 'Profiles, posts and followers by username / hashtag / URL',
    sampleInput: { usernames: ['example'], resultsLimit: 10 },
    contactHints: ['fullName', 'username', 'biography', 'followersCount', 'url'],
  },
  {
    id: 'apify/facebook-posts-scraper',
    name: 'Facebook Posts Scraper',
    category: 'Social',
    description: 'Posts + engagement from pages, groups and URLs',
    sampleInput: { startUrls: [{ url: 'https://www.facebook.com/example' }], resultsLimit: 10 },
    contactHints: ['pageName', 'text', 'url', 'likes', 'date'],
  },
  {
    id: 'apify/website-content-crawler',
    name: 'Website Content Crawler',
    category: 'Research',
    description: 'Crawl pages and extract text (RAG / research / monitoring)',
    sampleInput: { startUrls: [{ url: 'https://example.com' }], maxCrawlPages: 5, maxResults: 20 },
    contactHints: ['url', 'text', 'title', 'markdown'],
  },
  {
    id: 'apify/google-search-scraper',
    name: 'Google Search Scraper',
    category: 'Research',
    description: 'Organic results for queries (SERP monitoring, prospecting)',
    sampleInput: { queries: 'best crm for dentists', maxPagesPerQuery: 1, resultsPerPage: 10 },
    contactHints: ['title', 'url', 'description', 'position'],
  },
  {
    id: 'streamers/youtube-scraper',
    name: 'YouTube Scraper',
    category: 'Social',
    description: 'Videos, channels and comments by search / channel / URL',
    sampleInput: { searchKeywords: 'plumbing tips', maxResults: 10 },
    contactHints: ['title', 'channelName', 'url', 'viewCount', 'date'],
  },
  {
    id: 'apify/contact-info-scraper',
    name: 'Contact Info Scraper',
    category: 'Lead Gen',
    description: 'Emails + phones found on given websites',
    sampleInput: { startUrls: [{ url: 'https://example.com/contact' }] },
    contactHints: ['emails', 'phones', 'url', 'title'],
  },
];

function authHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function apifyError(error: any, fallback: string): Error {
  const status = error?.response?.status;
  const msg = error?.response?.data?.error?.message || error?.message || fallback;
  if (status === 401) return new Error('Invalid Apify token — reconnect in Settings → Integrations');
  if (status === 402) return new Error('Apify credits exhausted (free quota used up). Top up in your Apify console.');
  if (status === 429) return new Error('Apify rate limit hit — wait a minute and retry');
  return new Error(status ? `Apify error ${status}: ${msg}` : msg);
}

export class ApifyService {
  /** Decrypted token for this business, or throws a friendly not-configured error */
  static async requireKey(businessId: string): Promise<string> {
    const integration = await prisma.externalIntegration.findFirst({
      where: { businessId, provider: 'apify', isActive: true },
      select: { apiKeyEncrypted: true },
    });
    if (!integration?.apiKeyEncrypted) {
      throw new Error('Apify not connected. Add your token in Settings → Integrations → Apify');
    }
    return decryptData(integration.apiKeyEncrypted);
  }

  /** Who owns the connected token (validates + shows plan) */
  static async getAccount(businessId: string): Promise<{ username?: string; plan?: string; isPaying?: boolean }> {
    const apiKey = await this.requireKey(businessId);
    try {
      const res = await axios.get(`${APIFY_API}/users/me`, {
        headers: authHeaders(apiKey),
        timeout: 15000,
      });
      const u = res.data?.data || {};
      return { username: u.username, plan: u.plan?.name || u.plan, isPaying: u.isPaying ?? false };
    } catch (error: any) {
      throw apifyError(error, 'Failed to read Apify account');
    }
  }

  /** Start an actor run. Input is passed through to the actor. */
  static async startRun(
    businessId: string,
    opts: { actorId: string; input?: Record<string, unknown>; memoryMbs?: number; timeoutSecs?: number; build?: string }
  ): Promise<{ runId: string; status: string; datasetId?: string }> {
    const apiKey = await this.requireKey(businessId);
    const { actorId } = opts;
    if (!actorId || !ACTOR_ID_RE.test(actorId)) {
      throw new Error('Invalid actor id — expected format "owner/actor-name"');
    }
    if (opts.input !== undefined && (typeof opts.input !== 'object' || opts.input === null || Array.isArray(opts.input))) {
      throw new Error('Actor input must be a JSON object');
    }

    const startedAt = Date.now();
    try {
      const res = await axios.post(
        `${APIFY_API}/acts/${actorId}/runs`,
        {
          ...(opts.input || {}),
          ...(opts.build ? { build: opts.build } : {}),
          ...(opts.memoryMbs ? { memoryMbs: opts.memoryMbs } : {}),
          ...(opts.timeoutSecs ? { timeoutSecs: opts.timeoutSecs } : {}),
        },
        { headers: authHeaders(apiKey), timeout: 20000 }
      );
      const run = res.data?.data || {};
      await this.logUsage(businessId, {
        model: actorId,
        task: `apify-start:${run.id || 'unknown'}`,
        latencyMs: Date.now() - startedAt,
        success: true,
      });
      return { runId: run.id, status: run.status, datasetId: run.defaultDatasetId };
    } catch (error: any) {
      await this.logUsage(businessId, {
        model: actorId,
        task: 'apify-start:failed',
        latencyMs: Date.now() - startedAt,
        success: false,
      });
      throw apifyError(error, 'Failed to start Apify run');
    }
  }

  /** Current state of a run (also records final compute cost once) */
  static async getRun(businessId: string, runId: string): Promise<any> {
    const apiKey = await this.requireKey(businessId);
    if (!runId || /[/.]/.test(runId)) throw new Error('Invalid run id');
    try {
      const res = await axios.get(`${APIFY_API}/actor-runs/${runId}`, {
        headers: authHeaders(apiKey),
        timeout: 15000,
      });
      const run = res.data?.data || {};
      if (TERMINAL_STATUSES.includes(run.status)) {
        await this.recordRunCost(businessId, run);
      }
      return {
        id: run.id,
        actorId: run.actId,
        status: run.status,
        datasetId: run.defaultDatasetId,
        stats: run.stats,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      };
    } catch (error: any) {
      throw apifyError(error, 'Failed to read Apify run');
    }
  }

  /** Dataset items for a finished (or running) run */
  static async getRunItems(
    businessId: string,
    opts: { runId?: string; datasetId?: string; limit?: number; offset?: number; clean?: boolean }
  ): Promise<any[]> {
    const apiKey = await this.requireKey(businessId);
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
    const offset = Math.max(opts.offset ?? 0, 0);
    let datasetId = opts.datasetId;
    if (!datasetId) {
      if (!opts.runId) throw new Error('Provide runId or datasetId');
      const run = await this.getRun(businessId, opts.runId);
      if (!run.datasetId) throw new Error('Run has no dataset yet');
      datasetId = run.datasetId;
    }
    try {
      const res = await axios.get(`${APIFY_API}/datasets/${datasetId}/items`, {
        headers: authHeaders(apiKey),
        params: { format: 'json', clean: opts.clean !== false, limit, offset },
        timeout: 20000,
      });
      return Array.isArray(res.data) ? res.data : [];
    } catch (error: any) {
      throw apifyError(error, 'Failed to read Apify dataset items');
    }
  }

  /** Best-effort mapping of arbitrary scraper rows → Contact rows */
  static mapItemToContact(item: Record<string, unknown>): {
    name?: string; phone?: string; email?: string; company?: string;
    city?: string; state?: string; website?: string;
  } {
    const str = (v: unknown): string | undefined => {
      if (typeof v === 'string' && v.trim()) return v.trim();
      return undefined;
    };
    const firstStr = (...vals: unknown[]): string | undefined => {
      for (const v of vals) {
        const s = str(v);
        if (s) return s;
        if (Array.isArray(v)) {
          for (const e of v) {
            const es = str(e);
            if (es) return es;
          }
        }
      }
      return undefined;
    };

    const name = firstStr(
      item.title, item.name, item.fullName, item.pageName, item.channelName,
      item.companyName, item.author, item.username, item.ownerUsername
    );
    const phoneRaw = firstStr(item.phone, item.phoneNumber, item.telephone, item.mobile, item.contactPhone);
    const emailRaw = firstStr(item.email, item.contactEmail, item.authorEmail, item.businessEmail);
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : undefined;
    const phone = phoneRaw ? phoneRaw.replace(/\s+/g, ' ').slice(0, 32) : undefined;
    return {
      name,
      phone,
      email,
      company: firstStr(item.company, item.companyName, item.organization),
      city: firstStr(item.city, item.addressLocality, item.locationCity),
      state: firstStr(item.state, item.addressRegion, item.locationState),
      website: firstStr(item.website, item.url, item.profileUrl),
    };
  }

  /**
   * Import dataset items as CRM contacts (dedupe by phone/email within business).
   * Raw item is kept in contact.metadata.apify for auditability.
   */
  static async importRunItems(
    businessId: string,
    opts: { runId?: string; datasetId?: string; items?: Record<string, unknown>[]; limit?: number; tag?: string }
  ): Promise<{ imported: number; skipped: number; total: number }> {
    let items = opts.items;
    if (!items) {
      items = await this.getRunItems(businessId, {
        runId: opts.runId,
        datasetId: opts.datasetId,
        limit: Math.min(opts.limit ?? 200, 1000),
      });
    }
    items = (items || []).slice(0, Math.min(opts.limit ?? 200, 1000));
    if (items.length === 0) return { imported: 0, skipped: 0, total: 0 };

    const mapped = items
      .map((item) => ({ item, fields: this.mapItemToContact(item) }))
      .filter((m) => m.fields.name || m.fields.phone || m.fields.email);
    if (mapped.length === 0) return { imported: 0, skipped: items.length, total: items.length };

    const phones = [...new Set(mapped.map((m) => m.fields.phone).filter(Boolean))] as string[];
    const emails = [...new Set(mapped.map((m) => m.fields.email).filter(Boolean))] as string[];

    const existing = await prisma.contact.findMany({
      where: {
        businessId,
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails } }] : []),
        ],
      },
      select: { phone: true, email: true },
    });
    const existingPhones = new Set(existing.map((c) => c.phone).filter(Boolean));
    const existingEmails = new Set(existing.map((c) => c.email).filter(Boolean));

    const seen = new Set<string>();
    const toCreate = mapped.filter((m) => {
      const key = `${m.fields.phone || ''}|${m.fields.email || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      if (m.fields.phone && existingPhones.has(m.fields.phone)) return false;
      if (m.fields.email && existingEmails.has(m.fields.email)) return false;
      return true;
    });

    if (toCreate.length > 0) {
      await prisma.contact.createMany({
        data: toCreate.map((m) => ({
          businessId,
          name: m.fields.name || m.fields.company || 'Apify Lead',
          phone: m.fields.phone || null,
          email: m.fields.email || null,
          company: m.fields.company || null,
          city: m.fields.city || null,
          state: m.fields.state || null,
          source: 'apify',
          sourceId: opts.runId || 'manual',
          tags: ['apify-import', ...(opts.tag ? [opts.tag] : [])],
          // Prisma Json field: raw scraper row kept for audit (cast: rows are
          // arbitrary JSON from third-party actors, not statically typed)
          metadata: { apify: { runId: opts.runId || null, item: m.item } } as any,
        })),
      });
    }

    const imported = toCreate.length;
    await this.logUsage(businessId, {
      model: 'apify-import',
      task: `apify-import:${opts.runId || 'manual'}`,
      latencyMs: 0,
      success: true,
    });
    return { imported, skipped: items.length - imported, total: items.length };
  }

  /** Spend overview for Settings UI: runs + compute cost + imported leads */
  static async getUsage(businessId: string): Promise<{
    runsStarted: number; runsCompleted: number; computeUsd: number; contactsImported: number;
  }> {
    const [usage, contactsImported] = await Promise.all([
      prisma.aiUsageLog.findMany({
        where: { businessId, provider: 'apify' },
        select: { task: true, costUsd: true },
      }),
      prisma.contact.count({ where: { businessId, source: 'apify' } }),
    ]);
    const starts = usage.filter((u) => u.task.startsWith('apify-start:') && !u.task.endsWith(':failed')).length;
    const dones = usage.filter((u) => u.task.startsWith('apify-run:')).length;
    const computeUsd = usage.reduce((s, u) => s + (u.costUsd || 0), 0);
    return { runsStarted: starts, runsCompleted: dones, computeUsd: Number(computeUsd.toFixed(4)), contactsImported };
  }

  private static async logUsage(
    businessId: string,
    entry: { model: string; task: string; latencyMs: number; success: boolean; costUsd?: number }
  ): Promise<void> {
    try {
      await prisma.aiUsageLog.create({
        data: { businessId, provider: 'apify', model: entry.model, task: entry.task, latencyMs: entry.latencyMs, success: entry.success, costUsd: entry.costUsd ?? 0 },
      });
    } catch {
      // Usage logging must never break the operation
    }
  }

  /** Record final compute cost of a terminal run (idempotent per run id) */
  private static async recordRunCost(businessId: string, run: any): Promise<void> {
    try {
      const task = `apify-run:${run.id}`;
      const existing = await prisma.aiUsageLog.findFirst({ where: { businessId, provider: 'apify', task } });
      if (existing) return;
      const computeUnits = Number(run.stats?.computeUnits ?? 0) || 0;
      await this.logUsage(businessId, {
        model: run.actId || 'apify-run',
        task,
        latencyMs: 0,
        success: run.status === 'SUCCEEDED',
        costUsd: Number((computeUnits * USD_PER_COMPUTE_UNIT).toFixed(4)),
      });
    } catch {
      // never break status reads
    }
  }
}

export default ApifyService;
