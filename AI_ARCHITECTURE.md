# AI Architecture — BIZZ CRM

The AI layer is a **provider-agnostic gateway** that routes tasks to the cheapest viable model, falls back on failure, controls cost, and enforces guardrails. It never performs mutating actions directly.

## Components
- **Gateway:** `src/server/services/ai-gateway.service.ts` — `aiComplete(task, messages, ctx)`.
- **Routes:** `routes/ai.ts`, `routes/ai-sales-agent.ts`, `routes/ava.ts`, `routes/intelligence.ts`.
- **Legacy clients:** `ai.service.ts`, `ava-intelligence.service.ts` (kept for AVA/agent features).
- **Ledger:** `AiUsageLog` (Prisma) — every call logged (`businessId, provider, model, task, tokensIn/Out, costUsd, latencyMs, success`).

## Router
Task types (`AiTask`): `classification` (cheapest), `short_text` (fast), `reasoning` (strongest), `embedding`.
Provider config (`ProviderCfg`): `baseUrl`, `apiKey` ('' for Ollama), `models` per task, `costPer1kOut`.

```
aiComplete(task, messages)
   │
   ├─ CHAIN = [OpenRouter, OpenAI, Ollama]   (filtered by env keys present)
   │
   └─ for provider in CHAIN:
        if circuitOpen(provider): skip
        call /chat/completions
        on success → log AiUsageLog → return {text, provider, model, latencyMs}
        on fail    → markFailure (3 fails → open 5 min) → next provider
   └─ all fail → log failure → throw AI_GATEWAY_ALL_PROVIDERS_FAILED
```

## Providers (configured by env)
| Provider | Env | Models | $/1k out |
|----------|-----|--------|----------|
| OpenRouter | `OPENROUTER_API_KEY` | gpt-4o-mini (class/short), claude-sonnet-4.5 (reasoning) | 0.002 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini (class/short), gpt-4o (reasoning) | 0.006 |
| Ollama | `OLLAMA_BASE_URL` + `OLLAMA_MODEL` (default llama3.1:8b) | same model all tasks | 0 (local) |

## Fallback & resilience
- Ordered chain: cloud-cheap → premium → local. Local Ollama keeps platform functional if both clouds trip the breaker (privacy bonus — no egress).
- Circuit breaker: 3 consecutive failures → provider skipped 5 min (`breaker` Map in `ai-gateway.service.ts`).
- `getProviderStatus()` exposes health for dashboards.

## Cost control
- Per-call `costUsd` logged; aggregate via `AiUsageLog` (`AI_COST_REPORT.md`).
- Budget tiers 70/85/95% documented in `COST_OPTIMIZATION.md` — **logging only today; enforcement not yet in code** (`checkBudget` planned).
- No response cache yet (planned: Redis, 24h TTL for class/short_text).

## Guardrails
- Gateway returns **text only** — no tool execution. Mutating actions go through authenticated, human-gated API routes (`AI_GUARDRAILS.md`).
- Tenant lock: `businessId` from JWT; AI never crosses tenants.
- Prompt-injection defense: untrusted content wrapped as data; no secrets in prompts; output sanitized before send.
- Rate limited: `aiApiRateLimiter` (50/15m business).

## Agents
- **AVA intelligence** (`ava-intelligence.service.ts`): assistant/insights over CRM data (read-scoped).
- **AI sales agent** (`ai-sales-agent.ts`): drafts replies/proposals; send requires human approval tier (campaigns/whatsapp routes).
- **Intelligence** (`intelligence.ts`): scoring/summaries.

## Roadmap
Enforce budget hard-stop, add response cache, route more traffic to Ollama, add AI cost dashboard panel in `/api/metrics`.
