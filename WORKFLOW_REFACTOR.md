# Workflow Engine Refactor — §44 Migration Map

Goal: `executeNode` cyclomatic 235 → <20 per handler, zero behavior change.

## Slice status

| Node type | Old location | New home | Status |
|---|---|---|---|
| condition / if_else | inline switch | `workflow/condition.evaluator.ts` (pure) | ✅ slice-1 |
| update_contact | inline switch | `workflow/handlers/registry.ts` | ✅ slice-2 |
| add_tag | inline switch | registry | ✅ slice-2 |
| remove_tag | inline switch | registry | ✅ slice-2 |
| send_sms (stub) | inline | registry (next) | ⏳ slice-3 |
| delay / wait | inline | registry | ⏳ slice-3 |
| add_activity | inline | registry | ⏳ slice-3 |
| webhook | inline (HTTP) | `handlers/webhook.handler.ts` (injected fetch) | ⏳ slice-4 |
| trigger | inline | registry | ⏳ slice-4 |
| send_email | inline (EmailService) | registry | ⏳ slice-5 |
| send_whatsapp / send_message | inline (router svc) | registry | ⏳ slice-6 |
| ai_reply / ai_response / ai_score_lead | inline | `handlers/ai.handlers.ts` via **AI Gateway** | ⏳ slice-7 (also completes §9 migration) |

## Rules for each slice
1. Copy logic VERBATIM into handler; no "improvements" mid-migration.
2. executeNode case becomes a thin dispatch: `nodeHandlers[nodeType](ctx)`.
3. tsc --noEmit must be 0 + `node scripts/build-server.js` green before push.
4. One deploy per batch of slices; verify a real workflow execution after.

## Verification
- Unit: `tests/unit/condition.evaluator.test.ts`
- After all slices: cyclomatic target per handler <20; executeNode = pure
  routing + result aggregation.
