# EX-BE-02 / N03 Trading-System-owned Incremental Source Implementation

Status: `PORTAL_ACCEPTANCE_HARNESS_COMPLETE / N02_OWNER_PACK_PENDING /
OWNER_IMPLEMENTATION_PENDING / RUNTIME_V1_DORMANT`

Date: 2026-08-25

## 1. Outcome

Portal has completed the N03 acceptance boundary it owns. It now has an exact,
non-secret owner evidence package and a fail-closed verifier that chains an
implementation to accepted N02 bytes.

Trading System has not yet published N02 or an N03 source implementation. N03's
external exit gate therefore remains open. Portal did not modify Trading System,
create an index, read a business table, handle a source credential, build an owner
image, start a service or open network traffic.

## 2. Current owner implementation is not N03

Read-only inspection of AWS-HK on 2026-08-25 found the owner worktree still at:

- worktree `/home/bobby/.worktrees/trading-system-d4-paper-read`;
- branch `feat/d4-paper-read-facade`;
- HEAD `6049a73`;
- contract `d4.paper-read.v1`.

The v1 compatibility facade is valid only for a finite D4 qualification window.
Its current `PortalReadFeed.start()` performs an initial complete capture and starts
an unconditional refresh loop. Each refresh captures orders, fills and positions;
ordinary event paging can also force another refresh. It has count-bounded in-memory
event retention but no consumer lease, published retention floor or source-idle
steady-state contract.

This is why v1 remains dormant and cannot be relabeled as N03.

## 3. Owner implementation choices

Trading System owner may publish either:

1. `NATIVE_OUTBOX` — a suitable existing source-owned outbox/change stream; or
2. `DEMAND_DRIVEN_INCREMENTAL_FACADE` — bounded watermarks plus a consumer lease.

Both choices must implement the exact accepted N02 contract. Portal does not select
tables, write SQL, add source indexes or decide deletion semantics for the owner.
Any source index requires owner-reviewed query-plan evidence.

## 4. Required source properties

- exact `PAPER_BINANCE_USDM`, Paper/BINANCE scope, never caller-selectable;
- loopback-only owner listener behind the mTLS Source Proxy;
- dedicated read-only source identity; no DB, Redis or CLI credential reaches Portal;
- exact GET-only N02 routes and mandatory identity;
- no background source scan without an active consumer lease;
- exactly zero recurring SELECTs and source bytes after lease expiry;
- baseline only for a new epoch or explicit resync;
- ordinary delta pages never perform a full-state scan;
- deterministic UPSERT/DELETE tombstone, duplicate/replay and cursor behavior;
- bounded rows, bytes, rate, in-flight work, queue, RSS and scan amplification;
- source-attributed metrics sufficient to distinguish idle, leased and recovery work;
- dormant rollback independent of normal Trading System lifecycle.

## 5. Exact owner evidence package

The request-only template is:

`services/portal-execution-edge-rs/contracts/d4-paper-read-v2-implementation-request/`

The owner returns exactly five regular, non-symlink JSON files:

1. `owner-implementation.manifest.json`
2. `implementation-profile.json`
3. `source-metrics.json`
4. `query-plan-evidence.json`
5. `acceptance-results.json`

The package contains no token, API key, certificate, DSN, SQL text, query value,
business record, account, strategy or instrument value. Its manifest binds:

- the accepted N02 contract and N02 owner-pack manifest digests;
- the exact 40-character owner implementation commit;
- an immutable `linux/amd64` image digest;
- every evidence file by byte SHA-256;
- owner decision and sanitized evidence digest;
- an authority envelope that cannot activate Portal or add command/live authority.

## 6. Verification

Template self-check:

```bash
python3 scripts/execution-n03-implementation-verify.py --mode template
```

Owner draft:

```bash
python3 scripts/execution-n03-implementation-verify.py \
  --mode candidate \
  --pack-dir /absolute/path/to/n03-owner-pack \
  --n02-pack-dir /absolute/path/to/n02-owner-pack
```

Owner acceptance uses `--mode acceptance`. The verifier first runs N02 acceptance,
then validates the N03 implementation chain. It never imports artifacts, connects to
the source, starts a container or promotes a delivery profile.

## 7. Acceptance corpus

N03 requires all 14 owner scenarios:

- dedicated identity positive plus missing/wrong/revoked denial;
- GET-only fixed scope;
- lease expiry with zero source SELECTs;
- baseline watermark/counts;
- ordered incremental UPSERT and DELETE tombstone;
- duplicate/replay idempotency;
- cursor ahead/expired/gap failure and new BUILDING epoch resync;
- restart and source-loss recovery;
- rate, memory, queue and backpressure bounds;
- rollback to a dormant v1-compatible state.

Sanitized runtime evidence must include at least a 30-minute post-lease idle
observation, at least 100 active requests, one baseline, zero ordinary-delta full
scans and zero source errors. This is N03 implementation acceptance, not the later
24-hour promotion soak in N06/N07.

## 8. Portal test evidence

`scripts/test_execution_n03_implementation_verify.py` covers 15 fail-closed cases:

- valid request, candidate and owner acceptance;
- absent/unaccepted/drifted N02 dependency;
- contract, owner-manifest, file, image, commit and evidence digest drift;
- v1, scope, listener, method and route widening;
- DB credential handoff and authority widening;
- missing lease, idle source activity and ordinary-delta full scan;
- freshness/resource/amplification bound failure;
- missing/redaction-broken query-plan evidence;
- insufficient idle/active observation and incomplete acceptance corpus;
- extra file, symlink, relative path and duplicate JSON key rejection.

## 9. Exit and next phase

N03 closes only after:

1. N02 owner bytes pass acceptance;
2. Trading System owner publishes implementation commit and immutable image;
3. all sanitized N03 evidence passes acceptance;
4. the accepted bytes are imported in a separate contract/evidence-only Portal commit.

Only then may Portal begin N04, the Rust lease-aware shared consumer. N03 acceptance
does not itself activate source traffic, projection Query, SSE or Lane B.

