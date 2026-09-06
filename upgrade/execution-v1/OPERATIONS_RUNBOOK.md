# EDS-12 operations runbook

This runbook stages read-only product qualification. It does not authorize a
command relay, a source schema change, direct Trading System access, a broker
operation or a Live mutation.

## Preconditions

1. The Portal commit is on protected `main`; the release workflow has returned
   exact image digest, Cosign verification, SBOM and provenance for each
   declared service.
2. `./scripts/execution-eds12-qualification-test.sh --offline-dr` is green at
   the exact source commit.
3. The Edge accepts only deployment-bound mTLS plus a short-lived delegated
   `execution:manager-v2:read` JWT. The browser receives neither input.
4. Source profile, catalogue revision, environment and delegation audience
   match the selected profile. Any mismatch stops at typed unavailable.
5. Commands and Live mutation flags remain false.

## Stage order

| Order | Stage / profile | Admission | Required proof before next stage |
|---:|---|---|---|
| 1 | Paper / `PAPER_BINANCE_USDM` | named BFF read + local SSE only | browser seven-state matrix, source loss/recovery and cursor/epoch negatives |
| 2 | Sandbox / `SANDBOX_BINANCE_USDM` | same named reads; no fallback to Paper | profile isolation, empty/partial truth and recovery proof |
| 3 | Canary-over-Live (`CANARY_OVER_LIVE`) / `LIVE_BINANCE_USDM` | read-only view of the Live source profile, distinct stage label | Canary-vs-Live UI distinction and no implied mutation authority |
| 4 | Live / `LIVE_BINANCE_USDM` | read-only | redaction, exact image, source/DB/Edge failure matrix and rollback rehearsal |

Each stage is a separate immutable evidence row. A pass in Paper never grants
Sandbox or Live authority. A missing Live row is an authoritative empty state,
not a failed query or an invented zero.

## Runtime observation

- Read named same-origin BFF endpoints only. Never expose a raw relation,
  opaque cursor, delegated JWT, mTLS input, DSN or source URL to a browser.
- Preserve envelope `availability`, `freshness`, `completeness`, `as_of`,
  source contract/revision, profile and coverage on every cached or streamed
  item.
- Coalesce refreshes behind the existing admission policy; a stream reconnect
  must not turn a 401/403/400/404/502/503 into an infinite source-amplifying
  loop.
- Treat the source's 200-row / 1 MiB page bounds and opaque relation-bound
  cursor as hard limits. Do not infer global ordering, correction semantics,
  exact total history or replay from a current page.
- For BR-EX-81, stop the full-history drain on cursor expiry/cycle or any
  profile mismatch, record `PARTIAL` coverage and run a profile-local
  resnapshot. Never fall back to direct DB/Redis/broker access.

## Evidence capture

Store only sanitized evidence outside Git. It contains digests, booleans,
counts, profile/stage ids and test outcomes; it contains no credentials, DSNs,
raw source records, cookies or browser authorization headers.

The release owner runs `verify-deployed` after collecting workflow and browser
evidence. The verifier refuses evidence that is non-main, unsigned,
profile-mixed, incomplete, secret-shaped, command-enabled or claims an active
product without all required proof.
