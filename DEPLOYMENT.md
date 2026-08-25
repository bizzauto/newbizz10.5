# Deployment

BizzAuto runs as a Node/Express server (+ separate BullMQ worker process) and a React SPA, deployed to a VPS via **Docker + Coolify**. A Prometheus/Grafana/nginx monitoring stack is included.

## Build & run commands (`package.json`)
| Script | What it does |
|--------|--------------|
| `npm run build` | Build client (Vite) + copy `mobile-app` if present. |
| `npm run build:server` | Compile `src/server/**` → `dist/server/**` via `scripts/build-server.js` (esbuild, ESM). |
| `npm start` | `prisma generate && prisma migrate deploy && node dist/server/index.js`. |
| `npm run worker` | `node dist/server/workers/index.js` (BullMQ workers). |
| `npm run prisma:migrate:prod` | `prisma migrate deploy`. |
| `npm run docker:build` / `docker:run` | Build/run the image. |

> Run the **server and worker as two separate processes/containers** (or `npm start` + `npm run worker` in the same container). The worker needs Redis; if Redis is absent it logs a warning and skips queue processing (`workers/index.ts`).

## Docker
- `Dockerfile`: multi-stage — installs deps, runs `build` + `build:server`, produces a slim runtime image (Node 18/20).
- `docker-compose.prod.yml`: wires `server`, `worker`, `postgres`, `redis`, `nginx`, and the monitoring stack. Healthchecks on `/api/status/ready`.
- `monitoring/` (Prometheus + Grafana) and `nginx/` reverse proxy configs included.

## Environment variables (`.env.example`)
| Category | Vars |
|----------|------|
| DB | `DATABASE_URL` (postgres) |
| Redis | `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`; `USE_REDIS_CACHE=true` |
| Auth | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET` |
| Secrets | `ENCRYPTION_KEY` (32-byte, base64) |
| n8n | `N8N_URL`, `N8N_APP_API_KEY` (fallback `N8N_API_KEY`), `N8N_PASSWORD`, `N8N_ENCRYPTION_KEY`, `N8N_HOST`, `N8N_PROTOCOL` |
| AI | `NVIDIA_NIM_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`/`GEMINI_API_KEY`, `OLLAMA_BASE_URL`/`OLLAMA_MODEL` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_MAPS_API_KEY` |
| WhatsApp/GBP | per-business tokens stored in `Business`/`Integration` (encrypted at rest) |
| Push | FCM server key / VAPID keys — currently sourced per-business from the `Integration`/`Business` config (`DeviceToken` model), not a global `.env` var. |
| Misc | `NODE_ENV=production`, `PORT`, `CORS_ORIGINS`, `MONITOR_KEY`, `LOG_LEVEL`, `CLIENT_URL` |
| Host | `HOST_DOMAIN`, `WSS_*` (Socket.IO) |

> SSL verification to n8n is skipped only when `N8N_URL` is internal/private (`getN8nHttpsAgent`).

## Coolify notes
- Set the same env vars in the Coolify app. Run `prisma migrate deploy` once on first deploy (the `start` script does it automatically).
- Expose the server behind `nginx/` (terminates TLS, proxies `/api`, `/metrics`, serves the SPA).
- Use the `monitoring/` stack for Prometheus scrape (`/api/monitoring/metrics?key=MONITOR_KEY`) + Grafana.

## Rollback / migration safety
- Migrations are applied with `migrate deploy` (no destructive dev commands in prod).
- Back up Postgres before major schema changes.

See `ARCHITECTURE.md`, `MONITORING.md`, `TROUBLESHOOTING.md`, `SECURITY.md`.
