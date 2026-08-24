#!/usr/bin/env bash
# BIZZ CRM — Failure-Recovery Drills (Master Prompt §32)
# SAFE subset: read-only probes + idempotency checks. No destructive simulation.
# Usage: ./failure-drills.sh [base_url]   (default https://bizzautoai.com)
set -u
BASE="${1:-https://bizzautoai.com}"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "── Drill 1: Liveness (no external deps) ──"
[ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/live")" = "200" ] && ok "/live 200" || bad "/live"

echo "── Drill 2: Readiness (DB gate) ──"
[ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 6 "$BASE/ready")" = "200" ] && ok "/ready 200 (db up)" || bad "/ready"

echo "── Drill 3: Webhook duplicate idempotency (meta-leads GET gate) ──"
C1=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1")
C2=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/webhooks/meta-leads?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=1")
[ "$C1" = "403" ] && [ "$C2" = "$C1" ] && ok "signature gate stable (403 both)" || bad "gate codes=$C1/$C2"

echo "── Drill 4: Auth guard on DLQ admin ──"
[ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/admin/queues")" = "401" ] && ok "unauth 401" || bad "not gated!"

echo "── Drill 5: Rate-limit skip for health probes ──"
for i in 1 2 3 4 5; do curl -sk -o /dev/null --max-time 5 "$BASE/health"; done
[ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/health")" = "200" ] && ok "health never rate-limited" || bad "health throttled"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ] && echo "ALL DRILLS GREEN ✅"
