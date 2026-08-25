import { prisma } from '../db.js';
import logger from '../utils/logger.js';

/**
 * AI Gateway (Master Prompt §9/§39).
 *
 * Multi-provider (OpenRouter / OpenAI-compatible / Ollama) with:
 *  - task-based model routing (cheap model for cheap tasks)
 *  - ordered fallback chain per provider health
 *  - usage + cost logging into AiUsageLog
 *  - simple circuit breaker (3 consecutive failures -> provider skipped 5 min)
 */

export type AiTask =
  | 'classification'   // cheapest
  | 'short_text'       // fast
  | 'reasoning'        // strongest
  | 'embedding'        // provider-specific
  ;

interface ProviderCfg {
  name: string;
  baseUrl: string;
  apiKey: string; // '' for local ollama
  models: Record<'classification' | 'short_text' | 'reasoning', string>;
  costPer1kOut: number; // rough USD, for ledger
}

const OPENROUTER: ProviderCfg | null = process.env.OPENROUTER_API_KEY ? {
  name: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  models: {
    classification: 'openai/gpt-4o-mini',
    short_text: 'openai/gpt-4o-mini',
    reasoning: 'anthropic/claude-sonnet-4.5',
  },
  costPer1kOut: 0.002,
} : null;

const OPENAI: ProviderCfg | null = process.env.OPENAI_API_KEY ? {
  name: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: process.env.OPENAI_API_KEY,
  models: {
    classification: 'gpt-4o-mini',
    short_text: 'gpt-4o-mini',
    reasoning: 'gpt-4o',
  },
  costPer1kOut: 0.006,
} : null;

const OLLAMA: ProviderCfg | null = process.env.OLLAMA_BASE_URL ? {
  name: 'ollama',
  baseUrl: `${process.env.OLLAMA_BASE_URL.replace(/\/$/, '')}/v1`,
  apiKey: '',
  models: {
    classification: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    short_text: process.env.OLLAMA_MODEL || 'llama3.1:8b',
    reasoning: process.env.OLLAMA_MODEL || 'llama3.1:8b',
  },
  costPer1kOut: 0,
} : null;

// Preference order: cloud-cheap first, premium last, local as privacy/fallback
const CHAIN: ProviderCfg[] = [OPENROUTER, OPENAI, OLLAMA].filter(Boolean) as ProviderCfg[];

const breaker = new Map<string, { fails: number; openUntil: number }>();

export function getProviderStatus() {
  return CHAIN.map((p) => {
    const b = breaker.get(p.name);
    return {
      name: p.name, configured: true,
      circuitOpen: !!b && b.openUntil > Date.now(),
      models: p.models,
    };
  });
}

function isOpen(p: ProviderCfg): boolean {
  const b = breaker.get(p.name);
  if (!b) return false;
  if (b.openUntil > Date.now()) return true;
  if (b.openUntil && b.openUntil <= Date.now()) breaker.delete(p.name);
  return false;
}

function markFailure(p: ProviderCfg): void {
  const b = breaker.get(p.name) || { fails: 0, openUntil: 0 };
  b.fails += 1;
  if (b.fails >= 3) { b.openUntil = Date.now() + 5 * 60_000; b.fails = 0; }
  breaker.set(p.name, b);
}

async function callProvider(
  p: ProviderCfg, task: AiTask, messages: any[], opts: { maxTokens?: number; temperature?: number }
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const model = p.models[task] || p.models.short_text;
  const res = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
    },
    body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 800, temperature: opts.temperature ?? 0.4 }),
  });
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data: any = await res.json();
  return {
    text: data.choices?.[0]?.message?.content ?? '',
    tokensIn: data.usage?.prompt_tokens ?? 0,
    tokensOut: data.usage?.completion_tokens ?? 0,
  };
}

export interface GatewayResult {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

export async function aiComplete(
  task: AiTask,
  messages: any[],
  ctx: { businessId?: string; maxTokens?: number; temperature?: number } = {}
): Promise<GatewayResult> {
  let lastErr: unknown;
  for (const p of CHAIN) {
    if (isOpen(p)) continue;
    const started = Date.now();
    try {
      const out = await callProvider(p, task, messages, ctx);
      const latencyMs = Date.now() - started;
      await prisma.aiUsageLog.create({
        data: {
          businessId: ctx.businessId,
          provider: p.name, model: p.models[task], task,
          tokensIn: out.tokensIn, tokensOut: out.tokensOut,
          costUsd: Number(((out.tokensOut / 1000) * p.costPer1kOut).toFixed(6)),
          latencyMs, success: true,
        },
      }).catch(() => {});
      return { text: out.text, provider: p.name, model: p.models[task], latencyMs };
    } catch (err: any) {
      lastErr = err;
      markFailure(p);
      logger.warn(`[AiGateway] ${p.name} failed (${task}), falling back: ${err?.message}`);
    }
  }
  await prisma.aiUsageLog.create({
    data: { businessId: ctx.businessId, provider: 'none', model: '-', task, success: false, latencyMs: 0 },
  }).catch(() => {});
  throw new Error(`AI_GATEWAY_ALL_PROVIDERS_FAILED: ${String((lastErr as Error)?.message || lastErr).slice(0, 200)}`);
}
