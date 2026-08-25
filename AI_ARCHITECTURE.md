# AI Architecture

BizzAuto uses AI for sales copilots, lead scoring, auto-replies, content generation, and the "AVA" assistant. Three layers exist today, plus a planned unified gateway.

## 1. `AIService` — `src/server/services/ai.service.ts`

Provider-agnostic OpenAI-compatible client used across the app:
- Lazy-initialized clients keyed by env: **NVIDIA NIM** (`NVIDIA_NIM_API_KEY`, first priority — free), **Groq** (`GROQ_API_KEY`), **OpenRouter** (`OPENROUTER_API_KEY`), plus OpenAI/Google/Gemini.
- `providers` map exposes `text` / `code` model aliases; callers pick a provider + model.
- Used by lead scoring (`ai-lead-scoring.service.ts`), auto-reply (`ai-auto-reply.service.ts`), chatbot, content moderation (`content-moderation.service.ts`), course AI, etc.
- ~449 lines; exposes `generateText`, embeddings, etc. (read file for exact exports).

## 2. `AvaIntelligenceService` — `src/server/services/ava-intelligence.service.ts`

"AVA" is the conversational/business-intelligence assistant, exposed via `routes/ava.ts` and `routes/intelligence.ts`.
- `ava-intelligence.service.ts` builds a **DailyBriefing** (revenue, sales, leads, pipeline, appointments, support, team, alerts, recommendations) by querying Prisma directly — **100% free, no paid APIs**.
- `routes/ava.ts` also triggers and health-checks n8n (`/api/ava/n8n/status`, `/api/ava/n8n/trigger`) and can call OpenRouter/Gemma models for chat.
- `ai-analytics.service.ts` aggregates AI usage for dashboards.

## 3. Planned `AiGateway` — `src/server/services/ai-gateway.service.ts` (EXISTS)

`ai-gateway.service.ts` is already implemented and is the intended unified entry point:
- **Multi-provider chain:** `OPENROUTER` → `OPENAI` → `OLLAMA` (filtered by which env keys are set). Task-based model routing via `AiTask` = `classification | short_text | reasoning | embedding` (cheap model for cheap tasks).
- **Fallback:** iterates the chain; on failure logs + marks a circuit breaker (`markFailure`). After 3 consecutive failures a provider is skipped for 5 min (`breaker` map).
- **Usage + cost tracking:** every call writes an `AiUsageLog` row (`businessId`, `provider`, `model`, `task`, `tokensIn`, `tokensOut`, `costUsd`, `latencyMs`, `success`). This powers billing/cost dashboards (see `MONITORING.md`).
- **Self-hosted option:** `OLLAMA_BASE_URL` + `OLLAMA_MODEL` (e.g. `llama3.1:8b`) add a local, zero-cost provider (cost `0`). Compatible with LocalAI (OpenAI-compatible `/v1`).
- **Planned additions:** Redis response caching (keyed by `businessId`+prompt hash) and **per-business rate limiting** (token-bucket in Redis) to cap spend per tenant.

### Recommended call pattern
New AI features should call `aiGateway.aiComplete(task, messages, { businessId })` instead of touching `ai.service.ts` directly, so cost + circuit-breaking are centralized.

## Provider / env reference

| Env | Provider | Notes |
|-----|----------|-------|
| `NVIDIA_NIM_API_KEY` | NVIDIA NIM | Free, first priority in `ai.service.ts`. |
| `GROQ_API_KEY` | Groq | Free/fast. |
| `OPENROUTER_API_KEY` | OpenRouter | Fallback + gateway. |
| `OPENAI_API_KEY` | OpenAI | Gateway. |
| `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` | Anthropic | Health-checked in `status-health.ts`. |
| `GOOGLE_API_KEY` / `GEMINI_API_KEY` | Google/Gemini | Gateway + chat. |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Ollama/LocalAI | Self-hosted, free. |

See `N8N_ARCHITECTURE.md`, `MONITORING.md`.
