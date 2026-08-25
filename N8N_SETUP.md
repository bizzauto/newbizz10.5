# n8n Setup — BizzAuto Automation

n8n is the visual automation engine. The app already emits **domain events** (e.g. `lead.captured`, `deal.stage_changed`) and exposes them two ways:

1. **Event bus** — `emitEvent()` writes to the Redis stream `bizz:events` and to the `DomainEvent` table (audit log). n8n can subscribe via a Redis Trigger or poll the `/api/n8n` endpoints.
2. **Webhook trigger** — legacy webhook path posts to `{N8N_URL}/webhook/{workflowId}` when a `chatbotFlow` with `trigger: 'new_lead'` + `n8nWorkflowId` exists.

## 1. Deploy n8n

### Option A — bundled Docker Compose (recommended for a VPS)
```bash
cp .env.n8n.example .env          # edit values (set a real N8N_ENCRYPTION_KEY)
docker compose -f docker-compose.n8n.yml up -d
```
Open `http://<vps-ip>:5678` → **Settings → API keys** → create a key.
Set `N8N_BASE_URL` and `N8N_API_KEY` in the app's environment (Coolify / `.env`).

### Option B — Coolify
- New **n8n** service (official template) on the same Docker network as the app.
- Map `5678`, set `WEBHOOK_URL` to the public URL, enable `EXECUTIONS_MODE=queue` + Redis.
- Copy the API key into the app env.

## 2. Connect the app
- `N8N_BASE_URL=https://n8n.your-domain.com`
- `N8N_API_KEY=xxxxx`
- `N8N_URL=https://n8n.your-domain.com`   (legacy webhook path)

Verify: `GET /api/n8n/status` → `{ "configured": true, "workflows": N }`.

## 3. Wire a workflow to a lead
- In n8n, create a workflow with a **Webhook** trigger node (path e.g. `lead-capture`).
- In the app, create a `chatbotFlow`:
  ```json
  { "businessId": "<id>", "isActive": true, "trigger": "new_lead", "n8nWorkflowId": "lead-capture" }
  ```
- Or import `src/server/n8n-workflows/*.json` and activate them.

## 4. Event-driven (no legacy flow needed)
n8n can consume the Redis stream `bizz:events` directly, or you can use the app's
`/api/inbound-webhooks/:source` to receive external events that fan out into n8n.

## 5. Manage from the app
- `GET  /api/n8n/workflows`          — list workflows
- `POST /api/n8n/execute`             — `{ workflowId, data }` run a workflow
- `POST /api/n8n/webhook`             — `{ path, data }` trigger a webhook
- `POST /api/inbound-webhooks/:source`— push an external event into the bus

## Security
- Never expose n8n without auth on a public IP. Use Coolify's basic-auth or a reverse
  proxy with SSO; restrict the webhook path with a secret.
- The app validates `N8N_API_KEY` server-side; it is never returned to clients.
