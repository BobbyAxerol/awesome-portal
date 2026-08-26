# N12 Consolidated Trading System Command Publication Request

Status: `PORTAL_COMMAND_GATE_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`  
Request revision: `portal.execution.command-publication-request.v1`

This is the one consolidated command request from Portal to the Trading System
owner. It covers the first Paper/Sandbox protective commands, the later Live
protective ladder and the separately governed Live risk-increasing commands.
It does not derive authority from the 64-entry CLI catalogue and it does not
authorize a Source Proxy, DB/Redis/CLI/broker credential, runtime flag or
network change.

The checked-in files are non-authoritative templates: all routes are requested
but unpublished, every evidence digest is zero, `owner_accepted=false`,
`portal_reachable=false`, and `portal_activation=false`.

## Requested capabilities

| Capability | Environment | Risk | Effect |
|---|---|---|---|
| `paper.halt` | PAPER | R1 | protective, monotonic |
| `paper.cancel-open-orders` | PAPER | R1 | protective |
| `sandbox.halt` | SANDBOX | R2 | protective, monotonic |
| `sandbox.cancel-open-orders` | SANDBOX | R2 | protective |
| `live.halt` | LIVE_CANARY/LIVE_FULL | R3 | protective, monotonic |
| `live.reduce` | LIVE_CANARY/LIVE_FULL | R3 | protective, bounded |
| `live.emergency-close` | LIVE_CANARY/LIVE_FULL | R3 | protective, non-blind-retry |
| `live.resume` | LIVE_CANARY/LIVE_FULL | R4 | risk-increasing |
| `live.scale` | LIVE_CANARY/LIVE_FULL | R4 | risk-increasing |

The owner may publish a strict subset first. Missing entries remain unavailable
and cannot be filled from generic order APIs or CLI commands. Paper is accepted
before Sandbox; Live protective and Live risk-increasing are promoted by
separate future gates.

## Owner return pack

Return these regular, non-symlink, sanitized files:

1. `command-capability-catalogue.json`
2. `terminal-corpus-index.json`
3. `acceptance-results.json`
4. `owner-publication.manifest.json`
5. `schemas/<capability-id>.request.schema.json`
6. `schemas/<capability-id>.receipt.schema.json`
7. `fixtures/<capability-id>.request.valid.json`
8. `fixtures/<capability-id>.accepted.valid.json`
9. `fixtures/<capability-id>.terminal.valid.json`

Every published capability must preserve the exact requested POST path, the
common bounded GET verification path, TLS 1.3 mTLS plus a one-operation
delegated JWT, immutable request/payload hashes, target/version binding and an
owner-published idempotency policy. A POST response can only be
`ACCEPTED_NONTERMINAL`; it never means success. Terminal truth comes from the
verification route and remains one of `SUCCEEDED|FAILED|DENIED|PARTIAL`.
Timeout, disconnect, malformed receipt or unknown status becomes `UNCERTAIN`,
not retryable success/failure.

## Mandatory safety semantics

- command identity is separate from read identity;
- command kill switch and four risk-lane flags are independent of query/SSE;
- R3 and R4 require phishing-resistant step-up; R4 additionally requires two
  distinct approvers, envelope/cooling/rollback evidence and cannot inherit an
  emergency bypass;
- same-target R4 is blocked while any operation is `UNCERTAIN`;
- a new protective command is allowed during uncertainty only when the source
  proves both idempotency and monotonic protection; quantity-based close/reduce
  otherwise stays blocked pending reconciliation;
- request key replay with the same payload returns the original source
  operation; payload drift returns a conflict;
- unknown schema/status, stale target version, expiry, wrong audience/scope,
  redirect, over-limit payload and broker/source loss all fail closed;
- Portal never receives SQL, Redis, CLI, shell or broker authority.

## Verification

```bash
python3 scripts/execution-n12-command-publication-verify.py --mode template

python3 scripts/execution-n12-command-publication-verify.py \
  --mode candidate --pack-dir /secure/path/to/owner-pack

python3 scripts/execution-n12-command-publication-verify.py \
  --mode acceptance --pack-dir /secure/path/to/owner-pack
```

Even an accepted pack returns `portal_activation=false`. Portal first imports
the exact bytes, runs Paper negative/duplicate/ambiguity/restart/replay/source-
loss/rollback drills, then uses a separate owner-approved delivery-profile
promotion. No global command switch exists.
