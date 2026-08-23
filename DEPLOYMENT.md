# Deployment & Operations Runbook

Target: Coolify app `newbizz10.5` (uuid `nxjl1o6jd1hp2nxshv7ucyn8`) on VPS 87.76.169.6

## Deploy flow (what happens)
GitHub `main` → Coolify build (Dockerfile multi-stage):
builder: npm ci → prisma generate → vite + esbuild bundle (`scripts/build-server.js`)
runtime: lean `npm install` of ONLY external deps (see `commonExternals`) → prisma generate → non-recursive chown
Boot: `start.sh` → prisma db push (idempotent) → node dist/server/index.js

## ⚠️ Build reliability on this host (7.6GB RAM, ~37 containers)
The vite step OOM-kills under pressure (helper exit code 255). Pre-flight before deploys:

```bash
sync; echo 3 > /proc/sys/vm/drop_caches      # frees page cache
free -h                                       # want >1.5G free
# optional: stop heavy idle containers during the build window, restart after
```

Persistent swap already configured in /etc/fstab: /swapfile(8G) + /swapfile2(4G).

## NEVER commit untracked local files silently
Windows hides case-sensitivity/missing-file issues; the VPS will fail esbuild with
`Could not resolve './x.js'`. Before pushing new imports run:

```bash
node %TEMP%/check-imports.js   # verifies every relative import is git-tracked
```
(Incident log: facebook.service.ts was untracked → 3 failed builds.)

## Trigger deploy via API
```bash
curl -X POST 'http://localhost:8000/api/v1/applications/nxjl1o6jd1hp2nxshv7ucyn8/start?force=true' \
  -H "Authorization: Bearer <COOLIFY_TOKEN>" -H 'Content-Type: application/json' -d '{"force":true}'
```
Status: GET `/api/v1/deployments/{deploymentUuid}`.

## Routing (Traefik) — known landmines
- Apex domain `bizzautoai.com` is ALSO claimed by supabase-kong labels.
  Our routers carry custom label priority=500 (Coolify `custom_labels`, base64) so ours wins. Do not remove.
- `/data/coolify/proxy/dynamic/bizzauto-v3-override.yaml` (priority 200) points to a fixed IP — stale after any deploy; harmless while our priority wins, but delete when convenient.

## Post-deploy verification battery
```bash
docker ps --filter name=nxjl1o6jd1hp2nxshv7ucyn8        # healthy?
curl -sk -o /dev/null -w '%{http_code}' https://bizzautoai.com   # 200
curl -sk https://bizzautoai.com/health                            # JSON ok
# schedulers:
docker exec ukf8oncxlkodf2m10dntg18j redis-cli -a '<pw>' zcard bull:gbp-auto-post:repeat       # ≥1
docker exec ukf8oncxlkodf2m10dntg18j redis-cli -a '<pw>' zcard bull:campaign-scheduler:repeat  # ≥1
docker exec ukf8oncxlkodf2m10dntg18j redis-cli -a '<pw>' zcard bull:social-publish:repeat      # ≥1
```

## Redis (app)
Host `ukf8oncxlkodf2m10dntg18j:6379` (user `default`). Coolify injects the URL into
`REDIS_USERNAME` (quirk) — start.sh + redis-connection.ts both handle it.
Known noise: cache-client "Command timed out" logs are non-fatal; queues work.

## Rollback
Coolify keeps previous image tags: redeploy by selecting the older deployment, or
`git revert <sha> && push` then force-deploy again.
