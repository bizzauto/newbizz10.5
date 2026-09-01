import { prisma } from '../db.js';
import logger from '../utils/logger.js';
import { encryptData, decryptData } from './data-encryption.service.js';

/**
 * BYOK (Bring Your Own Key) AI Service.
 *
 * Customers store their OWN provider keys (Groq / OpenRouter / Nvidia / OpenAI
 * / custom OpenAI-compatible). Requests try user keys first (in priority
 * order, with per-key circuit breaker), then fall back to platform keys via
 * the existing AIService — BYOK usage does NOT consume platform AI credits.
 *
 * Keys are encrypted at rest (AES-256-GCM via data-encryption.service) and
 * never returned in full — only masked (last-4) to the frontend.
 */

export type ByokProvider = 'groq' | 'openrouter' | 'nvidia' | 'openai' | 'custom';

interface ProviderMeta {
  name: ByokProvider;
  baseUrl: string;
  defaultModel: string;
  keyPattern?: RegExp; // undefined = accept any non-empty (custom endpoints)
  keyHint: string; // shown in UI, e.g. where to get the key
}

// Mirrors ai.service.ts provider config so platform + BYOK stay consistent.
export const PROVIDERS: Record<ByokProvider, ProviderMeta> = {
  groq: {
    name: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    keyPattern: /^gsk_[A-Za-z0-9]{20,}$/i,
    keyHint: 'console.groq.com → API Keys (gsk_...)',
  },
  openrouter: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
    keyPattern: /^sk-or-[A-Za-z0-9-]{20,}$/i,
    keyHint: 'openrouter.ai/keys (sk-or-...)',
  },
  nvidia: {
    name: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'openai/gpt-oss-120b',
    keyPattern: /^nvapi-[A-Za-z0-9_-]{20,}$/i,
    keyHint: 'build.nvidia.com → API Keys (nvapi-...)',
  },
  openai: {
    name: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/i,
    keyHint: 'platform.openai.com/api-keys (sk-...)',
  },
  custom: {
    name: 'custom',
    baseUrl: '', // user MUST provide baseUrl
    defaultModel: 'default',
    keyHint: 'Any OpenAI-compatible endpoint (vLLM, LM Studio, LiteLLM...)',
  },
};

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    name: p.name,
    defaultModel: p.defaultModel,
    keyHint: p.keyHint,
    requiresBaseUrl: p.name === 'custom',
  }));
}

// ------------------- Validation -------------------

export function validateKeyInput(input: {
  provider: string;
  key: string;
  baseUrl?: string;
  defaultModel?: string;
}): { valid: boolean; error?: string } {
  const provider = input.provider as ByokProvider;
  if (!PROVIDERS[provider]) return { valid: false, error: `Unknown provider: ${input.provider}` };
  if (!input.key || input.key.trim().length < 8) return { valid: false, error: 'API key too short' };

  const meta = PROVIDERS[provider];
  if (meta.keyPattern && !meta.keyPattern.test(input.key.trim())) {
    return { valid: false, error: `Invalid ${provider} key format. Expected: ${meta.keyHint}` };
  }
  if (provider === 'custom' && !input.baseUrl?.startsWith('http')) {
    return { valid: false, error: 'Custom provider requires a valid baseUrl (http/https)' };
  }
  if (input.defaultModel && input.defaultModel.length > 120) {
    return { valid: false, error: 'Model name too long' };
  }
  return { valid: true };
}

function maskKey(key: string): string {
  const last4 = key.slice(-4);
  return `${last4}`;
}

// ------------------- CRUD -------------------

export async function addKey(businessId: string, input: {
  provider: ByokProvider;
  key: string;
  label?: string;
  baseUrl?: string;
  defaultModel?: string;
}) {
  const meta = PROVIDERS[input.provider];
  const plain = input.key.trim();
  const encrypted = encryptData(plain);
  const record = await prisma.aiProviderKey.create({
    data: {
      businessId,
      provider: input.provider,
      label: input.label?.slice(0, 80) || `${meta.name} key`,
      keyEncrypted: encrypted,
      keyLast4: maskKey(plain),
      baseUrl: input.baseUrl?.trim() || (meta.baseUrl || null),
      defaultModel: input.defaultModel?.trim() || meta.defaultModel,
      priority: input.provider === 'custom' ? -1 : 0, // user's custom/self-hosted first
    },
  });
  return serializeKey(record);
}

export async function listKeys(businessId: string) {
  const keys = await prisma.aiProviderKey.findMany({
    where: { businessId },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  return keys.map(serializeKey);
}

export async function updateKey(businessId: string, keyId: string, input: {
  label?: string;
  isActive?: boolean;
  priority?: number;
  defaultModel?: string;
  baseUrl?: string;
}) {
  const existing = await prisma.aiProviderKey.findFirst({ where: { id: keyId, businessId } });
  if (!existing) throw new Error('Key not found');

  const record = await prisma.aiProviderKey.update({
    where: { id: keyId },
    data: {
      label: input.label !== undefined ? input.label.slice(0, 80) : undefined,
      isActive: input.isActive,
      priority: input.priority,
      defaultModel: input.defaultModel !== undefined ? input.defaultModel.slice(0, 120) : undefined,
      baseUrl: input.baseUrl !== undefined ? input.baseUrl.trim() : undefined,
    },
  });
  return serializeKey(record);
}

export async function deleteKey(businessId: string, keyId: string) {
  const existing = await prisma.aiProviderKey.findFirst({ where: { id: keyId, businessId } });
  if (!existing) throw new Error('Key not found');
  await prisma.aiProviderKey.delete({ where: { id: keyId } });
  return { deleted: true };
}

function serializeKey(k: any) {
  return {
    id: k.id,
    provider: k.provider,
    label: k.label,
    keyMasked: `••••${k.keyLast4}`,
    keyLast4: k.keyLast4,
    baseUrl: k.baseUrl,
    defaultModel: k.defaultModel,
    priority: k.priority,
    isActive: k.isActive,
    lastUsedAt: k.lastUsedAt,
    lastError: k.lastError,
    failCount: k.failCount,
    totalRequests: k.totalRequests,
    createdAt: k.createdAt,
  };
}

// ------------------- Circuit breaker (per business+key) -------------------

const breaker = new Map<string, { fails: number; openUntil: number }>();
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 3 * 60_000;

function breakerKey(keyId: string) { return `key:${keyId}`; }
function isBreakerOpen(keyId: string): boolean {
  const b = breaker.get(breakerKey(keyId));
  if (!b) return false;
  if (b.openUntil > Date.now()) return true;
  breaker.delete(breakerKey(keyId));
  return false;
}
function markKeyFailure(keyId: string) {
  const b = breaker.get(breakerKey(keyId)) || { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= BREAKER_THRESHOLD) { b.openUntil = Date.now() + BREAKER_COOLDOWN_MS; b.fails = 0; }
  breaker.set(breakerKey(keyId), b);
}
function markKeySuccess(keyId: string) { breaker.delete(breakerKey(keyId)); }

// ------------------- Low-level provider call (OpenAI-compatible) -------------------

export class ByokKeyError extends Error {
  kind: 'AUTH' | 'RATE_LIMIT' | 'PROVIDER' | 'QUOTA';
  constructor(kind: ByokKeyError['kind'], message: string) {
    super(message);
    this.kind = kind;
  }
}

function classifyError(status: number): ByokKeyError['kind'] {
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 402) return 'QUOTA';
  return 'PROVIDER';
}

async function callUserKey(
  cfg: { id: string; baseUrl: string; apiKey: string; model: string },
  messages: any[],
  opts: { maxTokens?: number; temperature?: number }
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.4,
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 200);
    throw new ByokKeyError(classifyError(res.status), `${cfg.model} -> HTTP ${res.status}: ${body}`);
  }
  const data: any = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

// ------------------- High-level: try user keys with fallback -------------------

export interface ByokResult {
  text: string;
  provider: string;
  model: string;
  keyId: string;
  keyLabel: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export async function hasActiveUserKeys(businessId: string): Promise<boolean> {
  const count = await prisma.aiProviderKey.count({ where: { businessId, isActive: true } });
  return count > 0;
}

/**
 * Try all active user keys in priority order. Returns null when no user key
 * succeeds (caller should fall back to platform keys).
 */
export async function completeWithUserKeys(
  businessId: string,
  messages: any[],
  opts: { maxTokens?: number; temperature?: number; model?: string } = {}
): Promise<{ result: ByokResult | null; errors: string[] }> {
  const keys = await prisma.aiProviderKey.findMany({
    where: { businessId, isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
  if (keys.length === 0) return { result: null, errors: [] };

  const errors: string[] = [];
  for (const k of keys) {
    if (isBreakerOpen(k.id)) {
      errors.push(`${k.provider} (${k.label}): skipped — cooling down after repeated failures`);
      continue;
    }
    let plainKey: string;
    try {
      plainKey = decryptData(k.keyEncrypted);
    } catch {
      errors.push(`${k.provider} (${k.label}): key could not be decrypted — please re-add`);
      continue;
    }
    const baseUrl = k.baseUrl || PROVIDERS[k.provider as ByokProvider]?.baseUrl;
    if (!baseUrl) {
      errors.push(`${k.provider} (${k.label}): missing baseUrl`);
      continue;
    }
    const model = opts.model || k.defaultModel || PROVIDERS[k.provider as ByokProvider]?.defaultModel || 'default';
    const started = Date.now();
    try {
      const out = await callUserKey({ id: k.id, baseUrl, apiKey: plainKey, model }, messages, opts);
      const latencyMs = Date.now() - started;
      markKeySuccess(k.id);
      // Health bookkeeping (best-effort, never block the response)
      prisma.aiProviderKey.update({
        where: { id: k.id },
        data: { lastUsedAt: new Date(), lastError: null, failCount: 0, totalRequests: { increment: 1 } },
      }).catch(() => {});
      // Usage ledger — provider='byok:<name>' so cost reports can distinguish
      prisma.aiUsageLog.create({
        data: {
          businessId,
          provider: `byok:${k.provider}`,
          model,
          task: 'byok',
          tokensIn: out.tokensIn,
          tokensOut: out.tokensOut,
          costUsd: 0, // customer's own key — zero platform cost
          latencyMs,
          success: true,
        },
      }).catch(() => {});
      return {
        result: {
          text: out.text, provider: k.provider, model, keyId: k.id,
          keyLabel: k.label, latencyMs, tokensIn: out.tokensIn, tokensOut: out.tokensOut,
        },
        errors,
      };
    } catch (err: any) {
      const kind = err instanceof ByokKeyError ? err.kind : 'PROVIDER';
      markKeyFailure(k.id);
      prisma.aiProviderKey.update({
        where: { id: k.id },
        data: { lastError: String(err?.message || err).slice(0, 500), failCount: { increment: 1 } },
      }).catch(() => {});
      errors.push(`${k.provider} (${k.label}) [${kind}]: ${String(err?.message || err).slice(0, 160)}`);
      logger.warn(`[BYOK] ${k.provider} key failed, trying next: ${err?.message}`);
      // AUTH error = key invalid/revoked → try next key immediately (already doing that)
      continue;
    }
  }
  return { result: null, errors };
}
