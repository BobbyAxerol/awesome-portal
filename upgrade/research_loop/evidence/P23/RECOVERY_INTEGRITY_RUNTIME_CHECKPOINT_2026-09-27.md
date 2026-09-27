# F4/E10 + OL-02 — owned runtime qualification checkpoint

Date: 2026-09-27 · Codex · `docs/research-loop-plan`.
Scope: groups 3 and 4 of Bobby's existing eight-group goal; no substitute
goal, full P23/P24 or production claim. F6 and the current-history migration
proof remain closed by the preceding checkpoint, not rerun here.

## Authority and sources

Read the private full goal, Root AGENTS, Research A13, Unified live ledger,
P23/P24 guide and workload matrix, P16 README/phase-report/debt register,
P23 packet, E11–E17 receipt, and the current P11/repository/observer/worker
implementations. Bobby authorized this owned fault/qualification scope.
No shared preview 8095, dev/main, production, AWS-HK or Trading System change.

## Actual cell and identity

Project `portal-research-p23-ol12`, loopback `http://127.0.0.1:8096`.
Own PostgreSQL/NATS/artifact/roadmap volumes, private random credentials,
no auto-login; 20 reader identities plus two operators named `p23-*`.
All 22 pass actual activation → password rotation → password login → auth
context; actual principal IDs are distinct. They are not 20 copies of Bobby.
Their credentials/cookies/passwords stay in 0600 state files, never Git/logs.
TTL is two hours; cleanup/revocation is owned by the continuing P23 run.

Four images were built successfully and the cell started with six healthy
services and a live worker. Recorded application-source SHA is `12e00e7f…`;
identity honestly records `dirty:true` because this new harness/overlay was
uncommitted at build. This is not an exact final-HEAD/browser release receipt.
Worker uses `portal-research-child`, enforced; each runtime cgroup has its
exact decimal-byte cap and no extra swap allowance. Current provisioned
seven-service budget is 4.3 GB; optional MinIO gives 4.6 GB. No mixed-load or
latency PASS is inferred from those configured caps or service health.

## OL-02 — CLOSED owned real observer proof

Real P04 run `rrun_d8e174e6268aedbf868de56edd062b29` traversed Portal
preflight/admission, existing NATS dispatch, confined child, fenced retention
and public progress until `COMPLETED/READY`, on BTCUSDT 1h, approved read-only
HMD `crypto-binance-1m`, June 1–17 2026 half-open windows.

The real CSRF/session-protected `POST …/freeze/verify` produced six durable
receipts: original MATCH, copy MATCH, corrupted-copy MISMATCH, repeated
MISMATCH, restored-copy MATCH, original MATCH after observer restoration.
Both mismatch responses block integrity. Only a separate owned artifact copy
was corrupted (four bytes in one part). Only portal-api's private observer
root temporarily pointed at that copy; worker original root never changed.
No expected digest/part/manifest/receipt was rewritten. All six receipt IDs
exist in PostgreSQL; original all-file tree SHA and sealed DB expectation
are identical before/after. Observer configuration is restored normally.
GET still does not open source bytes; explicit POST owns verification.

## F4/E10 — CLOSED owned real recovery proof

Real P04 run `rrun_700ff629473cdf7f1f7e9ecde8252727` emitted an actual immutable
terminal event. A temporary trigger refused only this new run's terminal
checkpoint INSERT, after its real journal/sidecars/lifecycle. The owned worker
was stopped before removing the fault, excluding its background retry.
After the unchanged production 30-second age, the public Progress GET
reconciled the checkpoint: `COMPLETED/READY`, exactly one checkpoint.
Reread is idempotent and source-event byte hash is unchanged. No fake terminal,
source timestamp adjustment, immutable-row deletion or engine rerun.

Two further public P10 creates, in different operator workspaces, acquired
their actual production scheduler leases while the worker was paused:
`rrun_234ad8ffaad1866d62084df36c57069d` and
`rrun_d1819451ff2e540d65d65dca237d0985`.
Only mutable lease/retry timers of the first exact test job were advanced.
Public reads followed normal P06 recovery → RETRY_WAIT → typed FAILED
`P06_RETRY_NOT_DISPATCHED`; no source event was invented for it. The second
live job+attempt JSON byte hash stayed identical during both reads. After
restoring the worker it completed normally, rather than being damaged by
the recovery of its neighbour. The temporary trigger/function is absent.

An initial harness probe wrongly attempted a second scheduler claim even
though public P10 create had already claimed. It was rejected; no PASS was
taken from it. The harness now reads the actual public-path claim, and the
additional ordinary completed probe runs are retained, not rewritten/deleted.

## Private actual evidence

All files are 0600 beneath
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.

| File | Actual SHA-256 | Result |
|---|---|---|
| `integrity-receipt.json` | `58b471df47a504f8a9e6eee0584aec5d4374202e28417472f0e413a80828d9c8` | Six actual verify responses + immutable receipt readback + original tree/seal preservation |
| `recovery-receipt.json` | `4ceafe2cbd8fcc28a5e3c033ed9d83383a7f9cc10dbd96a614058e0a8fea806a` | Actual fault/reconcile/reread + retry-expiry + unchanged live lease |

Commands: `cell.mjs init/build/up/credentials`, `api-client.mjs`,
`real-run.mjs --profile=p04 --label=integrity-original`,
`integrity-receipt.mjs`, `recovery-receipt.mjs`, all bound to the owned cell.
Full/raw API responses, principal/session identities and image IDs are in
private receipts; business rows/cookies/source data are not committed.

Focused new helper tests cover bounded response consumption (oversized stream
cancelled before its next chunk), test-only identity, exact project/port,
private inputs/no auto-login, immutable profile choice, and actual named
report/search/replay load allowlist with mutation/namespace refusal.
Mandatory whole-workspace commit gate is recorded separately when terminal;
no bypass and no full engine rerun just for this documentation.

## Cleanup and remaining full scope

Fault trigger/function removed; observer root restored; worker restarted.
The P23 cell, artifact test copy, capped images and 22 test identities remain
owned by continuing qualification. Do not prune them while active. Final P23
teardown will revoke identities, stop exact project without deleting retained
source/evidence volumes, and inventory capacity. Stable users never changed.

Next: all OL-12/P23 real mixed-workload/fault/restore/cold/upgrade/scale gates,
full candidate browser writes/consumers (F3/F5/OL-24), signing/SBOM semantics
E6-BR-01, and full P24 review packet. Four of eight goal groups now have their
scoped backend proof; the goal remains ACTIVE, not PRODUCT_ACTIVE/released.
