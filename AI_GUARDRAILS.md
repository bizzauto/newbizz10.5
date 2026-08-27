# AI Guardrails — BIZZ CRM

Defines the safety boundary for every AI call routed through `src/server/services/ai-gateway.service.ts` and the AVA/agent layers (`ava-intelligence.service.ts`, `routes/ai.ts`, `routes/ai-sales-agent.ts`).

## 1. Tool permission model
AI agents must NOT call mutating backend actions directly. All side effects go through authenticated API routes; the agent holds a scoped service token.

| Capability | Allowed for AI | Mechanism |
|------------|----------------|-----------|
| Read CRM records (lead/deal/contact) | ✅ (business-scoped) | `GET /api/leads` etc., `req.user.businessId` |
| Draft message / proposal text | ✅ | returns text only |
| Send WhatsApp / email | ⚠️ human-approval tier 2+ | `POST /api/whatsapp` after approval flag |
| Create/delete records | ⚠️ human-approval tier 3 | audit + `requireRole` |
| Refund / billing change | ❌ forbidden | see §3 |
| Execute arbitrary code / shell | ❌ forbidden | app design |
| Call external URLs | ⚠️ SSRF-guarded only | `isSsrfSafeUrl` (`SECURITY.md`) |

## 2. Prompt-injection defense
- **Untrusted content is data, not instruction.** Lead/customer text, email bodies, webhook payloads are passed as `messages[].content` with a system instruction that ignores embedded "instructions".
- **Delimiter wrapping**: wrap untrusted input in explicit markers (e.g. `<customer_message>…</customer_message>`) before insertion; the system prompt states instructions outside delimiters win.
- **No tool auto-execution**: the gateway (`aiComplete`) only returns text; it never invokes tools. Tool use is a separate, authenticated, human-gated step.
- **Output sanitization**: AI-generated text rendered to users passes `sanitizeInput` (`middleware/`) before send; strip `<script>`, `javascript:`, `on*=` (see `SECURITY.md`).
- **Leak prevention**: never include `N8N_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, DB URL in any prompt. `piiMask` masks emails/phones/IDs in logs (`middleware/`).
- **Tenant lock**: every call carries `businessId`; the AI service never crosses tenant boundaries (enforced by `req.user.businessId`, `middleware/auth.ts`).

## 3. Forbidden AI actions (hard block)
1. Issuing payments / refunds / wallet debits.
2. Deleting businesses, users, or bulk records.
3. Modifying RBAC roles or auth secrets.
4. Sending to non-whitelisted external URLs (SSRF guard).
5. Approving its own human-approval requests (separation of duties).
6. Accessing other tenants' data.
These are enforced in code by route guards (`requireRole`, `requireBusinessOwner`) and by excluding mutating tools from the agent's available set.

## 4. Human-approval tiers
| Tier | Action | Who approves | Code hook |
|------|--------|--------------|-----------|
| 1 | Draft/summarize (read-only) | none (auto) | `aiComplete` |
| 2 | Send message to ≤ contact list / single lead | business user (sender) | approval flag on `/api/whatsapp`, `/api/campaigns` |
| 3 | Bulk campaign (> X recipients) / create records | `ADMIN`/`OWNER` | `requireRole('OWNER','ADMIN')` |
| 4 | Financial/billing changes | forbidden — no AI path | n/a |

Approval is recorded in `AuditLog`/`Activity` (`services/audit.service.ts`) for traceability.

## 5. Cost & abuse guardrails
- Budget thresholds 70/85/95% (`COST_OPTIMIZATION.md`) can soft-block premium tasks.
- Per-business rate limit `aiApiRateLimiter` (50/15 min, `SECURITY.md`).
- Failure circuit breaker (3 fails → 5 min skip) in `ai-gateway.service.ts`.

## 6. Monitoring
- Every call logged to `AiUsageLog` (`businessId`, `provider`, `model`, `task`, `tokensIn/Out`, `costUsd`, `latencyMs`, `success`) — `ai-gateway.service.ts`.
- Anomalous prompt-injection or abuse surfaced via `services/security/*` (threat-detection, security-monitor).
