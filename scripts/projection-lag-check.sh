#!/usr/bin/env bash
# Poll Core's per-profile projection lag signal and exit by state, so cron, a systemd timer or a Monitor
# can alert on it. Read-only: one GET, no secret, no write.
#
#   scripts/projection-lag-check.sh [BASE_URL]        default BASE_URL=http://localhost:8080 (dev loopback)
#   stable loopback:  scripts/projection-lag-check.sh https://127.0.0.1 -k   (extra args go to curl)
#
# Exit codes: 0 OK, 1 LAGGING, 2 STALE, 3 UNKNOWN or disabled or unreachable or unreadable.
# Prints one line per profile that is not OK, then a summary line.
set -uo pipefail
BASE="${1:-http://localhost:8080}"
shift || true
BODY="$(curl -fsS -m 10 "$@" "${BASE%/}/api/control/healthz/projection-lag" 2>/dev/null)" || {
  echo "projection-lag: UNREACHABLE ${BASE}"; exit 3; }
printf '%s' "$BODY" | python3 -I -c '
import json, sys
try:
    doc = json.load(sys.stdin)
except Exception:
    print("projection-lag: UNREADABLE response"); sys.exit(3)
status = doc.get("status")
for p in doc.get("profiles", []):
    if p.get("state") != "OK":
        print("projection-lag: %s %s age=%s snapshot_present=%s" % (
            p.get("profile_id"), p.get("state"), p.get("age_seconds"), p.get("snapshot_present")))
print("projection-lag: %s (lagging>%ss stale>%ss)" % (
    status, doc.get("lagging_after_seconds"), doc.get("stale_after_seconds")))
sys.exit({"OK": 0, "LAGGING": 1, "STALE": 2}.get(status, 3))
'
