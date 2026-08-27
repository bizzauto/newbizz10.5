# Cost Optimization — BIZZ CRM AI Spend

AI cost is tracked centrally in `AiUsageLog` (`prisma/schema.prisma`) written by `src/server/services/ai-gateway.service.ts`. This doc defines budgeting, routing, and savings levers.

## 1. What is tracked
Every gateway completion logs (`ai-gateway.service.ts#aiComplete`):
- `businessId`, `provider`, `model`, `task`
- `tokensIn`, `tokensOut`
- `costUsd` = `(tokensOut/1000) * costPer1kOut`
- `latencyMs`, `success`

Query example (monthly per business):
```sql
SELECT businessId, provider, model, SUM(tokensOut) AS toks,
       SUM(costUsd) AS cost
FROM "AiUsageLog"
WHERE "createdAt" > now() - interval '30 days'
GROUP BY businessId, provider, model
ORDER BY cost DESC;
```

## 2. Model routing (cheap-first)
Chain order in `ai-gateway.service.ts` (`CHAIN`): OpenRouter → OpenAI → Ollama (local, $0).
Task → model map:
| Task | OpenRouter model | OpenAI model | Ollama |
|------|------------------|-------------|--------|
| classification | gpt-4o-mini | gpt-4o-mini | llama3.1:8b |
| short_text | gpt-4o-mini | gpt-4o-mini | llama3.1:8b |
| reasoning | claude-sonnet-4.5 | gpt-4o | llama3.1:8b |

Rule: route `classification`/`short_text` to mini/cheap; reserve `reasoning` (premium) for genuine reasoning only.

## 3. Budget thresholds
Per business (or platform-wide aggregate). Recommended tiers:
| Threshold | Action | Where |
|-----------|--------|-------|
| 70% | Warn — dashboard banner + `Activity` note | metrics/alert job |
| 85% | Throttle — downgrade `reasoning`→`short_text`, prefer Ollama | `aiComplete` pre-check |
| 95% | Hard-stop premium — allow Ollama/classification only | `aiComplete` pre-check |

> Status: thresholds are **documented but not yet enforced in code**. `ai-gateway.service.ts` logs cost but does not block. Implement a `checkBudget(businessId)` before `aiComplete` (see `COST_OPTIMIZATION` todo in `TODO.md`).

## 4. Caching
- **No response cache today.** Add a semantic cache keyed on `(businessId, task, hash(messages))` with TTL 24h for `classification`/`short_text` (high repeat, low variance).
- Cache store: Redis (`utils/redis-connection.ts`) — already available, avoids new infra.
- Expected saving: classification/short_text are ~60–70% of calls; caching cuts repeat-spend significantly.

## 5. Local / free models (Ollama)
- Set `OLLAMA_BASE_URL` + `OLLAMA_MODEL` (default `llama3.1:8b`). `costPer1kOut = 0`.
- Use for: classification, short_text, internal summaries, dev/test. Keep `reasoning` on cloud only when quality gaps appear.
- Fallback: if both cloud providers trip the circuit breaker, Ollama keeps the platform functional (privacy bonus — no data leaves VPS).

## 6. Other levers
- Lower `max_tokens` default (currently 800) for short_text where possible.
- Batch lead scoring (currently per-contact loop in `lead-processing` worker) → fewer calls.
- Drop premium model for non-English triage if Ollama quality is acceptable.
- Alert on a single `businessId` exceeding 2× its 30-day median (abuse/anomaly).

## 7. Potential monthly savings (estimate)
Assumes ~1.2M output tokens/mo/platform at blended $0.004/1k:
- Routing + Ollama for 50% of calls: **~40%**
- + response cache on classification/short_text: **~+20%**
- + budget hard-stop preventing runaway: **~+10%**
Combined realistic target: **~60–65% reduction** vs naive all-premium routing.
