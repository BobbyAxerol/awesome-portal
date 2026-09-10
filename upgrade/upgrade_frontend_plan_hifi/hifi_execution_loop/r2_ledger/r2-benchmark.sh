#!/usr/bin/env bash
# R2-0 repeatable baseline. Re-run this to reproduce performance-baseline.v1.json.
#
# It only issues authenticated GETs against the dev stack, so it is safe to run
# at any time: no route it touches writes anything.
set -euo pipefail
HOST="${R2_HOST:-http://127.0.0.1:8080}"
USER_HEADER="${R2_DEV_EMAIL:-claude-probe@azdag.com}"
COOKIE="$(mktemp)"; trap 'rm -f "$COOKIE"' EXIT
SAMPLES="${R2_SAMPLES:-30}"
OPS=(screens/paper screens/blotter screens/sandbox screens/live alphas
     broker-bindings portfolios screen-contracts runtime-manifest activation/capabilities)

curl -sS -c "$COOKIE" -X POST "$HOST/api/auth/login" \
  -H 'content-type: application/json' -H "x-dev-access-email: $USER_HEADER" \
  -d "{\"username\":\"${R2_USER:-claude-probe}\",\"credential\":\"${R2_CREDENTIAL:?set R2_CREDENTIAL, never hard-code it}\"}" \
  -o /dev/null

printf '%-24s %5s %9s %9s %9s %12s %12s\n' operation n p50 p95 p99 identity gzip_hdr
for op in "${OPS[@]}"; do
  times=()
  for _ in $(seq 1 "$SAMPLES"); do
    times+=("$(curl -sS -b "$COOKIE" -H "x-dev-access-email: $USER_HEADER" \
      "$HOST/api/v1/execution/$op" -o /dev/null -w '%{time_total}')")
  done
  identity=$(curl -sS -b "$COOKIE" -H "x-dev-access-email: $USER_HEADER" \
    -H 'Accept-Encoding: identity' "$HOST/api/v1/execution/$op" -o /dev/null -w '%{size_download}')
  # Content-Encoding is empty while compression is off; that is itself a baseline fact.
  enc=$(curl -sS -D- -o /dev/null -b "$COOKIE" -H "x-dev-access-email: $USER_HEADER" \
    -H 'Accept-Encoding: gzip' "$HOST/api/v1/execution/$op" | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="content-encoding"{print $2}')
  printf '%s\n' "${times[@]}" | python3 -c "
import sys
v=sorted(float(x)*1000 for x in sys.stdin)
q=lambda p: v[min(len(v)-1,round(p*(len(v)-1)))]
print(f'$op|{len(v)}|{q(.50):.1f}|{q(.95):.1f}|{q(.99):.1f}')" \
  | awk -F'|' -v id="$identity" -v e="${enc:-none}" \
    '{printf "%-24s %5s %9s %9s %9s %12s %12s\n",$1,$2,$3,$4,$5,id,e}'
done
