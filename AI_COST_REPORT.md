# AI Cost Report — BIZZ CRM

Estimated AI spend based on the `AiUsageLog` schema (`prisma/schema.prisma`) and routing in `src/server/services/ai-gateway.service.ts`. Figures are **realistic estimates** for a mid-sized platform (~200 active businesses, ~1.2M output tokens/mo) — replace with live aggregates from `AiUsageLog`.

## 1. Provider / model usage + cost

| Provider | Model | Task mix | Out tokens/mo | $/1k out | Cost/mo | % of spend |
|----------|-------|----------|---------------|----------|---------|-----------|
| openrouter | claude-sonnet-4.5 | reasoning (15%) | 180,000 | 0.003 | $540 | 45% |
| openrouter | gpt-4o-mini | classification+short_text (45%) | 540,000 | 0.00015 | $81 | 7% |
| openai | gpt-4o | reasoning fallback (10%) | 120,000 | 0.005 | $600 | 40% |
| openai | gpt-4o-mini | classification+short_text (25%) | 300,000 | 0.00015 | $45 | 4% |
| ollama | llama3.1:8b | local (5%) | 60,000 | 0.000 | $0 | 0% |
| **Total** | | | **1,200,000** | | **~$1,266** | 100% |

## 2. By feature

| Feature | Provider/model | Out tokens/mo | Cost/mo |
|---------|----------------|---------------|---------|
| Lead classification / scoring | gpt-4o-mini / llama3.1 | 250,000 | $38 |
| AI sales agent replies | claude-sonnet-4.5 / gpt-4o | 300,000 | $900 |
| Proposal generation | claude-sonnet-4.5 | 120,000 | $360 |
| Daily KPI report summarize | gpt-4o-mini | 80,000 | $12 |
| Support triage (n8n Code) | heuristic (no LLM) | 0 | $0 |
| Review/reply drafting | gpt-4o-mini / llama3.1 | 120,000 | $18 |
| AVA intelligence | mixed | 330,000 | $38 |
| **Total** | | **1,200,000** | **~$1,266** |

## 3. By tenant (top consumers, estimate)

| Business (id mask) | Out tokens/mo | Cost/mo | Flag |
|--------------------|---------------|---------|------|
| biz_aa31** | 210,000 | $221 | >2× median — review |
| biz_7f02** | 165,000 | $173 | normal |
| biz_c4e9** | 140,000 | $147 | normal |
| (other 197) | 685,000 | $725 | — |

## 4. Potential savings

| Lever | Effort | Est. saving/mo |
|-------|--------|---------------|
| Route classification/short_text to Ollama (local, $0) | low | ~$119 |
| Add 24h response cache on classification/short_text | med | ~$250 |
| Enforce 85% throttle: downgrade reasoning→short_text | low | ~$180 |
| 95% hard-stop premium for abuse tenants | low | ~$127 |
| Batch lead scoring (fewer calls) | med | ~$40 |
| **Total realistic** | | **~$700 (55%)** |

## 5. Actions
1. Implement `checkBudget(businessId)` in `ai-gateway.service.ts` (70/85/95% tiers — `COST_OPTIMIZATION.md`).
2. Stand up Redis response cache for `classification`/`short_text`.
3. Enable `OLLAMA_BASE_URL` in prod for local cheap tasks.
4. Weekly `AiUsageLog` report to `/api/metrics` consumers; alert on 2×-median tenants.
