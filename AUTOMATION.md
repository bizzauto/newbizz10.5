# BIZZ CRM — Automation Systems

Last verified: 2026-08-23 (all systems live in production)

## Background Workers (in-process with API server)

All BullMQ consumers run inside `dist/server/index.js` via `src/server/workers/index.ts`.
The standalone `worker.js` entry is redundant — do NOT run it separately.

| Queue | Consumer | Producer(s) |
|---|---|---|
| whatsapp-messages | WhatsApp send router worker | Campaigns, scheduler, APIs |
| emails | Email sender worker | Direct `EmailService` used elsewhere; queue ready |
| social-publish | Multi-platform publisher | **Social Dispatcher** (repeat 60s, jobId `social-dispatcher`) |
| google-sheets-sync | Sheets sync | Manual/API |
| lead-processing | LeadCapture by source (indiamart/justdial/facebook_ads/instagram_ads/generic) | **Meta Leads webhook**, IndiaMART autosync (direct), inbox poller (direct) |
| campaign-scheduler | Runs campaignId + **dispatch-due-posts-style tick** | **Campaign Dispatcher** (repeat 60s, jobId `campaign-dispatcher`) |
| gbp-auto-post | GBP publisher | **GBP Scheduler** (repeat 60s, jobId `gbp-auto-post-scheduler`) |
| scheduled-messages | DB-scheduled WhatsApp flush | Self-rescheduling pattern |

## Cron / Intervals started at boot (`index.ts`)

| System | Interval | Gate |
|---|---|---|
| Audit log prune | cron | always |
| IndiaMART autosync | 5 min | businesses w/ integration |
| Lead inbox poller (JustDial etc.) | 15 min | `Business.leadInboxConfig.enabled` |
| Follow-up engine tick | 10 min | per-business pending follow-ups |
| Review QR AI auto-reply pass | 15 min | GBP connected + auto-reply/QR enabled |
| Social dispatcher / Campaign dispatcher / GBP scheduler | BullMQ repeat 60s | Redis available |

## Lead Ingestion Paths

1. **Facebook/Instagram Ads**: Meta webhook → `POST /api/webhooks/meta-leads`
   (signature: `META_APP_SECRET`; verify: `META_WEBHOOK_VERIFY_TOKEN`)
   → Graph fetch → queue job id `meta-lead:{leadgen_id}` (idempotent)
2. **IndiaMART**: built-in autosync ticker
3. **JustDial/email**: set `Business.leadInboxConfig` JSON:
   `{enabled:true, imap:{email,password,host,port}, platform:"justdial", intervalMinutes:15}`
4. Reply-suppression: follow-up engine skips contacts with any replied message.

## DLQ / Failed Jobs

Failed jobs retained 7 days (removeOnFail). Admin recovery endpoints
(`SUPER_ADMIN`): `/api/admin/queues`, `/:queue/failed`, `/failed/:id/retry`,
`/failed/retry-all`. See `routes/admin-queues.ts`.
