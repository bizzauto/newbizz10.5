# TODO - SaaS “Perfect MVP” (Repo-specific)

## Phase 0 — Baseline (already implemented)
- [x] MEMBER email verification enforcement in `src/server/middleware/auth.ts` (403 `EMAIL_NOT_VERIFIED`).
- [x] Registration creates new customers as `MEMBER` in `src/server/routes/auth.ts`.
- [x] Ava workflow trigger hardening: strict workflowId validation in `src/server/routes/ava.ts`.
- [x] React StrictMode dev double-init guard in `src/AppWrapper.tsx` (MobileApp.init).

## Phase 1 — Perfect MVP UI wiring (Conversion-ready)  ✅ Step 1
- [ ] Ensure navigation exposes/links the core pages (if not already):
  - OnboardingWizard / AutoSetupWizard
  - StatusPage
  - Billing / Subscriptions
  - SupportTickets
  - AuditLog (and export)
  - ApiKeys
  - TwoFactorSetupModal (if gated)
  - WhatsAppModule / Conversations
- [ ] Verify that each page is protected correctly:
  - MEMBER accounts without verified email cannot access authenticated routes.
  - SUPER_ADMIN pages remain accessible.
- [ ] Onboarding completion flow:
  - [ ] ensure “first success” actions exist (e.g., connect WhatsApp, create first pipeline stages, enable Ava).
  - [ ] show progress and CTA links.
- [ ] WhatsApp connect readiness:
  - [ ] add UI guidance if WhatsApp is not connected.
  - [ ] after connect, show quick actions: “create first automation”, “send first template message”, “get Ava briefing”.
- [ ] Subscriptions/usage transparency UX:
  - [ ] ensure Billing/Subscriptions screens display plan + limits + next renewal.
  - [ ] show usage stats + warnings near limits.
- [ ] Support & reliability:
  - [ ] ensure SupportTickets page supports creating new tickets and viewing status.
  - [ ] ensure StatusPage includes relevant system health (and shows n8n/AI connectivity status if available).
- [ ] Audit & roles:
  - [ ] ensure AuditLog page uses correct API endpoints.
  - [ ] ensure permission checks on role management views.

## Phase 2 — Ava contract + validation hardening ✅ Step 2
- [ ] Confirm frontend Ava service payload always matches backend:
  - `POST /api/ava/command` expects `{ command, params }`
  - update `src/services/ava.service.ts` if needed.
- [ ] Confirm voice parsing recognizes “trigger workflow/run automation …” with strict regex workflowId.
- [ ] Ensure frontend pre-validates workflowId format before calling backend.
- [ ] Align error handling UX with backend error codes:
  - `trigger_workflow_invalid_workflow_id`
  - `trigger_workflow_missing_workflow_id`

## Phase 3 — Thorough testing runbook ✅ Step 3
- [ ] Backend auth critical-path:
  - [ ] `POST /api/auth/register` returns role MEMBER.
  - [ ] authenticated call before verification returns 403 `EMAIL_NOT_VERIFIED`.
  - [ ] send/verify email token flow → authenticated call succeeds.
- [ ] Ava thorough tests:
  - [ ] `POST /api/ava/command` with valid `trigger workflow <workflowId>` triggers webhook.
  - [ ] invalid workflowId returns expected error code.
  - [ ] missing `params` returns proper error.
- [ ] SUPER_ADMIN plan change permissions:
  - [ ] verify SUPER_ADMIN can change plan via `/api/subscriptions/*`.

## Phase 4 — Release readiness
- [ ] Run `npm test` (if available) and `npm run typecheck`.
- [ ] Smoke test core pages in the UI: Dashboard, WhatsApp, Automations, Billing, Support, AuditLog, Ava widget.

