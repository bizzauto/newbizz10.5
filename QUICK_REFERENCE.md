# BIZZ CRM - QUICK REFERENCE

## 📍 Where Everything Lives

**Local Repository:**
\C:\Users\HP\Desktop\FIXED BEST\bizzauto-automation\

**Production:**
- Site: https://bizzautoai.com
- Repo: bizzauto/newbizz10.5:main
- Commit: 4486b7d
- Container: nxjl1o6jd1hp2nxshv7ucyn8-180622581193

## 🔑 Key Implementation Files

### Core Automation
\\\
src/server/services/n8n.service.ts           - n8n API client
src/server/services/workflow-execution.service.ts - Execution tracking
src/server/events/eventBus.ts                - Event publishing (Redis streams)
\\\

### AI Systems
\\\
src/server/services/ai-gateway.service.ts    - Multi-provider AI router
src/server/services/ai-lead-scoring.service.ts - Lead scoring
src/server/services/ai-auto-reply.service.ts - Conversation agent
src/server/services/claude-whatsapp.service.ts - WhatsApp AI
\\\

### Lead Capture
\\\
src/server/services/lead-capture.service.ts  - Unified capture
src/server/services/indiamart-sync.service.ts - IndiaMART
src/server/services/meta-leads.service.ts    - Facebook/Instagram
\\\

### WhatsApp
\\\
src/server/services/whatsapp.service.ts      - Main WhatsApp service
src/server/routes/whatsapp.ts                - WhatsApp API routes
\\\

### Workers
\\\
src/server/workers/scheduled-message.worker.ts - Follow-up automation
src/server/workers/outreach.worker.ts         - Outreach campaigns
\\\

### n8n Workflows
\\\
src/server/n8n-workflows/
├── lead-capture.json
├── ai-daily-report.json
├── deal-stage-change.json
└── ... (9 total)
\\\

## 📊 Implementation Status

**18/52 Phases Complete (35%)**

✅ Working:
- Event-driven architecture
- n8n integration (9 templates)
- Lead capture (6 sources)
- AI lead scoring
- WhatsApp + AI agent
- AI gateway (multi-provider)
- Follow-up automation
- Payment webhooks
- Self-healing workers
- Multi-tenant security

❌ Missing Priority Items:
- AUDIT_REPORT.md
- Human approval engine
- /health /live /ready endpoints
- Feature flags
- Comprehensive testing
- Churn detection
- Revenue intelligence

## 🔧 Recent Fixes

**Redis Worker Timeout Fix (deployed today):**
- Removed \commandTimeout\ from ioredis
- Files: redis-connection.ts, redis.service.ts
- Result: 3324 → 0 timeouts
- Commit: dac6312 → 4486b7d
- Deploy: 1054 (FINISHED)

## 📖 Documentation Files

All in root directory:
- IMPLEMENTATION_STATUS.md (NEW - full status)
- ARCHITECTURE.md
- N8N_ARCHITECTURE.md
- AI_ARCHITECTURE.md
- AUTOMATION.md
- SECURITY.md
- DATABASE.md
- DEPLOYMENT.md
- MONITORING.md
- BIZZ_AUTOMATION_ROADMAP.md

## 🎯 Next Steps

1. Create AUDIT_REPORT.md (comprehensive system audit)
2. Implement human approval engine (Phase 16)
3. Add health check endpoints (Phase 42)
4. Build testing infrastructure (Phase 39-40)
5. Implement feature flags (Phase 38)

---
Last Updated: 2026-08-27 00:05:10
