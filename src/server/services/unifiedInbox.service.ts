import { prisma } from '../db.js';

/**
 * Unified Inbox service for BIZZ CRM.
 *
 * Aggregates Messages (the confirmed model name; the schema stores the body
 * in `content` and the channel in `type`) grouped by contactId, and enriches
 * each conversation with Contact name, latest Message, message count, unread
 * count, latest LeadScore.score, and Lead status.
 *
 * NOTE: The schema has NO `Deal` model, so Deal context is intentionally
 * omitted. Any field used below was verified against prisma/schema.prisma.
 */

export interface InboxConversation {
  contactId: string;
  contactName?: string;
  channel: string;
  lastMessageAt?: Date;
  lastMessage?: string;
  unread: number;
  sentiment?: string;
  intent?: string;
  leadScore?: number;
  status?: string;
  assignedUserId?: string;
  messageCount: number;
}

export interface InboxMessage {
  id: string;
  channel: string;
  direction: string;
  body: string;
  status: string;
  createdAt: Date;
}

export interface InboxConversationDetail {
  contact?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    status?: string;
    assignedTo?: string | null;
  };
  lead?: {
    id: string;
    status?: string;
    score?: number;
  } | null;
  leadScore?: {
    score: number;
    category?: string;
    confidence?: number;
  } | null;
  messages: InboxMessage[];
}

export interface InboxConversationSummary {
  messageCount: number;
  channels: string[];
  firstSeen?: Date;
  lastSeen?: Date;
  suggestedReplyPlaceholder?: string;
}

// How many recent messages to pull for the in-memory group-by. Kept bounded
// so the endpoint stays cheap even with large message tables.
const RECENT_MESSAGE_LIMIT = 500;

/**
 * Aggregate Messages grouped by contactId and enrich with Contact / Lead /
 * LeadScore context. Falls back to an in-memory reduce over the most recent
 * messages (groupBy across a nullable contactId is awkward in Prisma).
 */
export async function listConversations(
  businessId: string,
  filter?: { channel?: string; assignedUserId?: string; status?: string }
): Promise<InboxConversation[]> {
  // 1. Pull recent messages for this business that are tied to a contact.
  const messages = await prisma.message.findMany({
    where: {
      businessId,
      contactId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: RECENT_MESSAGE_LIMIT,
    select: {
      id: true,
      contactId: true,
      direction: true,
      type: true,
      content: true,
      status: true,
      createdAt: true,
    },
  });

  // 2. Reduce into per-contact buckets (newest message wins per bucket).
  interface Bucket {
    contactId: string;
    channel: string;
    lastMessageAt?: Date;
    lastMessage?: string;
    unread: number;
    messageCount: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const m of messages) {
    const cid = m.contactId as string;
    if (!cid) continue;
    let b = buckets.get(cid);
    if (!b) {
      b = {
        contactId: cid,
        channel: m.type || 'unknown',
        unread: 0,
        messageCount: 0,
      };
      buckets.set(cid, b);
    }
    // First row per contact is the newest (createdAt desc).
    if (!b.lastMessageAt) {
      b.lastMessageAt = m.createdAt;
      b.lastMessage = m.content;
      b.channel = m.type || 'unknown';
    }
    b.messageCount += 1;
    if (m.direction === 'in' && m.status !== 'read') {
      b.unread += 1;
    }
  }

  const contactIds = Array.from(buckets.keys());
  if (contactIds.length === 0) return [];

  // 3. Fetch supporting context in parallel.
  const [contacts, leadScores, leads] = await Promise.all([
    prisma.contact.findMany({
      where: { id: { in: contactIds }, businessId },
      select: {
        id: true,
        name: true,
        status: true,
        assignedTo: true,
      },
    }),
    prisma.leadScore.findMany({
      where: { contactId: { in: contactIds }, businessId },
      select: { contactId: true, score: true, category: true, aiConfidence: true },
    }),
    prisma.lead.findMany({
      where: { contactId: { in: contactIds }, businessId },
      select: { contactId: true, status: true, score: true },
    }),
  ]);

  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const scoreMap = new Map(leadScores.map((s) => [s.contactId, s]));
  const leadMap = new Map(leads.map((l) => [l.contactId, l]));

  // 4. Build the result and apply filters.
  const result: InboxConversation[] = [];
  for (const b of buckets.values()) {
    const contact = contactMap.get(b.contactId);
    const score = scoreMap.get(b.contactId);
    const lead = leadMap.get(b.contactId);

    const conv: InboxConversation = {
      contactId: b.contactId,
      contactName: contact?.name,
      channel: b.channel,
      lastMessageAt: b.lastMessageAt,
      lastMessage: b.lastMessage,
      unread: b.unread,
      leadScore: score?.score,
      sentiment: score?.category || undefined,
      intent: score?.category || undefined,
      status: lead?.status || contact?.status,
      assignedUserId: contact?.assignedTo || undefined,
      messageCount: b.messageCount,
    };

    // Channel filter operates on the latest message's channel (type).
    if (filter?.channel && conv.channel !== filter.channel) continue;
    if (filter?.assignedUserId && conv.assignedUserId !== filter.assignedUserId) continue;
    if (filter?.status && conv.status !== filter.status) continue;

    result.push(conv);
  }

  // Newest activity first.
  result.sort((a, b) => {
    const at = a.lastMessageAt?.getTime() || 0;
    const bt = b.lastMessageAt?.getTime() || 0;
    return bt - at;
  });

  return result;
}

/**
 * Full message thread for a single contact plus contact / lead / leadScore
 * context. Returns null-shaped objects when context is missing.
 */
export async function getConversation(
  businessId: string,
  contactId: string
): Promise<InboxConversationDetail> {
  const [messages, contact, lead, leadScore] = await Promise.all([
    prisma.message.findMany({
      where: { businessId, contactId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        type: true,
        direction: true,
        content: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.contact.findFirst({
      where: { id: contactId, businessId },
      select: { id: true, name: true, phone: true, email: true, status: true, assignedTo: true },
    }),
    prisma.lead.findFirst({
      where: { contactId, businessId },
      select: { id: true, status: true, score: true },
    }),
    prisma.leadScore.findFirst({
      where: { contactId, businessId },
      select: { score: true, category: true, aiConfidence: true },
    }),
  ]);

  const thread: InboxMessage[] = messages.map((m) => ({
    id: m.id,
    channel: m.type || 'unknown',
    direction: m.direction,
    body: m.content,
    status: m.status,
    createdAt: m.createdAt,
  }));

  return {
    contact: contact
      ? {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          email: contact.email,
          status: contact.status,
          assignedTo: contact.assignedTo,
        }
      : undefined,
    lead: lead ? { id: lead.id, status: lead.status || undefined, score: lead.score } : null,
    leadScore: leadScore
      ? {
          score: leadScore.score,
          category: leadScore.category,
          confidence: leadScore.aiConfidence,
        }
      : null,
    messages: thread,
  };
}

/**
 * Structural summary of a conversation. Deliberately does NOT call any AI
 * service — it only derives stats from message metadata. `suggestedReplyPlaceholder`
 * is a static, structural hint (may be undefined when there is no thread).
 */
export async function getConversationSummary(
  businessId: string,
  contactId: string
): Promise<InboxConversationSummary> {
  const messages = await prisma.message.findMany({
    where: { businessId, contactId },
    orderBy: { createdAt: 'asc' },
    select: { type: true, direction: true, createdAt: true },
  });

  const channels = Array.from(new Set(messages.map((m) => m.type || 'unknown')));
  const firstSeen = messages.length ? messages[0].createdAt : undefined;
  const lastSeen = messages.length ? messages[messages.length - 1].createdAt : undefined;

  // Structural placeholder only — no model call. Swap for an AI call later
  // if/when a reply-suggestion endpoint is added.
  const hasInbound = messages.some((m) => m.direction === 'in');
  const suggestedReplyPlaceholder = hasInbound
    ? 'Hi, thanks for reaching out! How can we help you with your query?'
    : undefined;

  return {
    messageCount: messages.length,
    channels,
    firstSeen,
    lastSeen,
    suggestedReplyPlaceholder,
  };
}
