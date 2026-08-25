# BIZZ AUTOMATION ROADMAP - BizzAuto CRM to AI Business OS

> Repo: `bizzauto/bizzauto-automation` (copy of BizzAuto CRM, branch master)
> Phase: 1 (Audit + Roadmap). Per master prompt: NO code changes until this doc + audit are approved.
> Principle: Do NOT rewrite the app. Extend it into an event-driven, n8n-powered, AI-assisted business OS.

---

## 1. Current State (verified)

**Stack (unchanged from source CRM):**
- Frontend: React + Capacitor + Tailwind + shadcn/ui (mobile app + web).
- Backend: Express (TypeScript), Prisma + PostgreSQL, Redis + BullMQ (queues/workers), FCM (free push).
- Auth: Google OAuth (web popup + native redirect), multi-tenant `businessId`.
- AI: LLM helper (`src/server/services/llm.ts`) used by ava/chat + a webhook (Dograh) for outbound calling.
- Deploy: VPS `87.76.169.6` + Coolify (self-hosted, free).

**What is ALREADY automated (BullMQ workers + `automation.ts` engine):**
- `worker.ts` - generic job runner.
- `outreach.worker.ts` - outreach/campaign messaging.
- `scheduled-message.worker.ts` - scheduled follow-ups.
- `gbp-auto-post.worker.ts` - Google Business Profile auto-posting.
- `automation.ts` route - DB-driven trigger/condition/action engine.
- Integrations present: Dograh (outbound call webhook), Jimi TTS, FCM, OneSignal (deprecated), social lead capture (`leads.ts`).

**What is NOT there (gaps the master prompt targets):**
- n8n is NOT integrated. Only `n8n/workflows.json` exists as a sample. No n8n client, no event-to-n8n bridge, no deployed workflows.
- No event-driven backbone - `DomainEvent` model exists but nothing publishes/consumes a central event bus into n8n.
- No centralized webhook ingress for external triggers (WhatsApp, forms, payments, ad platforms).
- No visual workflow builder surface for non-technical users.
- AI is fragmented (single LLM call in a few places), not an agent/orchestration layer.
- No self-hosted alternatives to paid per-call services (TTS, transcription, email).

---

## 2. Problems / Pain Points

| # | Problem | Impact |
|---|---------|--------|
| P1 | n8n absent - automation hardcoded in workers, not visual/editable | Non-tech team cannot build/modify flows |
| P2 | No event bus - modules fire jobs ad-hoc, hard to trace | Brittle, no audit trail of "why X happened" |
| P3 | Paid per-API services (calling/TTS) inflate opex | Margin loss, vendor lock-in |
| P4 | AI calls scattered, no caching/rate-limit/guardrail | Cost spikes, inconsistent quality |
| P5 | No inbound webhook layer | Can't automate lead/form/ad/whatsapp triggers |
| P6 | Tenant isolation not enforced on automation engine | Cross-business data leak risk |

---

## 3. Automation Opportunities (n8n workflows by department)

**Sales & CRM**
- Lead capture -> enrich -> assign -> welcome SMS/WhatsApp -> reminder sequence.
- Deal-stage change -> notify owner, log activity, trigger proposal gen.
- Inactivity detector -> re-engagement nudge.

**Marketing**
- GBP auto-post (existing worker -> move into n8n for visual control).
- Social post scheduler across FB/IG/LinkedIn/X.
- Review-request flow after deal close.

**Customer Support**
- WhatsApp/email -> ticket -> AI triage -> route -> SLA timer -> escalate.
- Auto-reply + human handoff.

**Finance / Ops**
- Invoice due -> reminder -> late fee -> retry.
- Expense capture from receipt image (AI OCR -> ledger).
- Daily/weekly digest to owners.

**AI Agents**
- "Ava" as n8n-callable AI node: summarize, draft, classify, call external tools.
- Scheduled AI report builder (KPIs -> narrative -> send).

---

## 4. AI Opportunities

- Central LLM gateway with caching, rate-limit, cost tracking (`AiUsageLog` already exists - wire it in).
- Self-hosted models option (Ollama/LocalAI) for cost-free internal tasks.
- AI agents per department orchestrated by n8n (not separate apps).
- Voice AI self-hosted (Whisper + Piper/TTS) to replace paid calling/TTS.

---

## 5. Cost Savings (targets)

| Item | Now | After | Saving |
|------|-----|-------|--------|
| Push (FCM) | free | free | yes |
| Hosting (Coolify) | self-host free | self-host free | yes |
| Calling/TTS | paid per call | self-host Whisper+Piper | high |
| AI calls | scattered, no cache | cached gateway | medium |
| n8n | none | self-host free | yes |

---

## 6. Implementation Priority (phased, per master prompt order)

Phase 1 (this doc): Repository audit + roadmap. DONE - pending approval.
Phase 2: Event architecture - `DomainEvent` publisher + central event bus + Redis stream.
Phase 3: n8n integration layer - install n8n on VPS, build `N8nClient` + `/api/n8n/*` + webhook ingress `/api/webhooks/*`.
Phase 4: Migrate existing BullMQ workers into n8n workflows (GBP, outreach, scheduled).
Phase 5: AI gateway - caching, rate-limit, cost tracking, self-host option.
Phase 6: Department workflows (sales, marketing, support, finance).
Phase 7: Self-hosted voice AI (Whisper + Piper) replacing paid services.
Phase 8: Docs (ARCHITECTURE, N8N_ARCHITECTURE, AUTOMATION, AI_ARCHITECTURE, etc.) + monitoring + security hardening.

> NOTE: Master prompt lists 49-52 granular phases. Above is the condensed dependency order. Full per-phase breakdown to be expanded in `AUTOMATION.md` / `WORKFLOW_TEMPLATES.md` once Phase 1 is approved.

---

## 7. Risk

- R1: n8n + app sharing one Redis/Postgres - must namespace queues + enforce `businessId` on every webhook.
- R2: Self-hosted AI voice quality - needs testing before replacing paid path.
- R3: Migrating live workers to n8n could break current automations - do behind feature flag.
- R4: Context/scope - 52 phases is large; implement incrementally, one verifiable slice at a time.

---

## 8. Expected Impact

- Non-technical team can build/edit automations visually (n8n UI).
- 100% self-hosted stack = $0 incremental opex beyond VPS.
- Event-driven audit trail for every automation ("why did X happen").
- AI agents embedded per-department, not as separate apps.
- Reproducible: this repo becomes the template for every client/business.
