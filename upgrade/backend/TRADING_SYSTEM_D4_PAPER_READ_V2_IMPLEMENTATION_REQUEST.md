# Trading System owner request — D4 Paper Read v2

Status: `OWNER_REQUEST_DISPATCHED / IMPLEMENTATION_PENDING / RUNTIME_V1_DORMANT`

Date: 2026-08-26  
Requested by: Bobby  
Portal implementation owner: Codex  
Source implementation owner: Trading System owner/agent

## 1. Decision and requested outcome

Bobby has already approved the named N07/N08 Paper-shadow promotion. Do not ask
for that Portal approval again. The remaining dependency is source-owned:
publish and implement `d4.paper-read.v2`, then return the exact sanitized N02
and N03 packages described below.

The requested result is deliberately narrow:

1. retain `d4.paper-read.v1` as the dormant rollback path;
2. publish one exact incremental read contract for fixed scope
   `PAPER_BINANCE_USDM`;
3. implement that contract inside the Trading-System-owned D4 read facade;
4. prove lease, incremental, bounds, security, restart and rollback behavior;
5. return nine non-secret JSON artifacts to Portal;
6. leave Portal delivery, Query, analytics, SSE and every command path off.

This request authorizes implementation and bounded Paper read-only acceptance
for the exact scope above. It does not authorize Paper commands, broker calls,
live/canary authority, Trading System database mutation, Portal activation or a
permanent source window.

## 2. Why this fits the Portal Execution Edge architecture

This is the missing source half of the architecture already implemented by
Portal:

```text
Trading System-owned data and semantics
  -> loopback D4 v2 read facade on AWS-HK
  -> AWS-local mTLS Source Proxy
  -> Rust Portal Execution Edge shared consumer
  -> Portal-owned PostgreSQL projection
  -> Rust Query/SSE
  -> TypeScript BFF on SGP
  -> browser Portal session
```

Ownership remains clean:

- Trading System owns source tables, source semantics, deletion meaning,
  source query plans and the read facade implementation.
- Source Proxy owns the workload mTLS and dedicated read-identity boundary.
- Portal Rust Edge owns demand, lease consumption, durable cursor, projection,
  replay, retention, Query and SSE fan-out.
- TypeScript owns Portal session/RBAC and delegated read JWT issuance.
- SSH is operator/bootstrap transport only. It is not a runtime data path.

The Portal agent may use SSH to inspect versions, deliver this non-secret
request, retrieve the returned non-secret package and run acceptance. That does
not grant Portal direct DB, Redis, CLI, broker or Trading System code authority.
Any source-code change is made and committed in the Trading System repository
under its own rules.

## 3. Current proven state

Read-only discovery on AWS-HK found:

- worktree: `/home/bobby/.worktrees/trading-system-d4-paper-read`;
- branch: `feat/d4-paper-read-facade`;
- inspected HEAD: `6049a73`;
- current published revision: `d4.paper-read.v1`;
- v1 behavior: finite qualification bridge with full refresh semantics;
- requested v2 facts are not yet owner-published.

Do not rename v1 to v2. Do not synthesize an accepted package around v1.

## 4. Preferred minimal implementation

Prefer `DEMAND_DRIVEN_INCREMENTAL_FACADE` over a new native outbox unless a
suitable Trading-System-owned outbox already exists and is demonstrably less
invasive. Extend the existing D4 facade; do not redesign the trading engine.

Required boundary:

- loopback-only owner listener, currently expected at `127.0.0.1:8011`;
- only `GET /v2/events` behind the existing Source Proxy;
- exact, non-caller-selectable Paper/BINANCE scope `PAPER_BINANCE_USDM`;
- mandatory dedicated read-only identity;
- no Portal DB/Redis/CLI credential handoff;
- no broker request, command, mutation, live or canary authority;
- no recurring source scan without an active lease;
- one active lease per identity, opaque token, 30-second TTL;
- exactly zero recurring source SELECTs and bytes after lease expiry;
- one baseline per new epoch or explicit resync;
- ordinary delta requests must not execute full-state scans;
- strict epoch-bound ordered cursor and deterministic replay;
- full-record `UPSERT`, explicit `DELETE` tombstone and stable event ID;
- typed `LEASE_EXPIRED`, `CURSOR_AHEAD`, `CURSOR_EXPIRED` and
  `GAP_DETECTED` responses;
- retention floor and earliest recoverable cursor on every page;
- source loss stops cursor advancement;
- restart/replay never silently skips or duplicates committed facts.

Use the exact limits from the request pack. In particular: maximum 1,000 rows
and 8 MiB per response, 120 requests/minute, two requests in flight, queue depth
64, RSS 512 MiB and scan amplification no greater than 10 source rows per
returned row.

The first implementation should avoid business-table schema or index changes.
If one index is genuinely required, do not improvise it: provide one
consolidated owner-reviewed query-plan/change/rollback request before applying
it.

## 5. N02 — publish the contract before the implementation claims acceptance

Start from the delivered request directory:

`d4-paper-read-v2-request/`

Return exactly this directory:

```text
/home/bobby/portal-n02-n03-v2-return/n02-owner-pack/
  owner-pack.manifest.json
  incremental-contract.json
  compatibility-fixtures.json
  error-corpus.json
```

Requirements:

- replace every request/example/placeholder value with owner-published truth;
- keep revision `d4.paper-read.v2`, previous revision v1 and exact fixed scope;
- publish response/event/error wire semantics, not prose-only intent;
- bind the three payload files and the capability contract by byte SHA-256;
- bind an exact 40-character source contract commit;
- set `owner_accepted=true` only after the owner corpus passes;
- keep every authority boolean false except `contract_only=true`.

Owner-side candidate check:

```bash
python3 verifiers/execution-n02-contract-verify.py \
  --mode candidate \
  --pack-dir /home/bobby/portal-n02-n03-v2-return/n02-owner-pack
```

Final check uses `--mode acceptance` against the same bytes.

## 6. N03 — implement and prove the source

Implement the accepted N02 bytes on a dedicated Trading System feature branch.
Preserve the v1 rollback path and follow the repository's branch, test, commit
and review rules. Do not merge or deploy beyond the bounded owner window unless
the Trading System workflow separately permits it.

Return exactly:

```text
/home/bobby/portal-n02-n03-v2-return/n03-owner-pack/
  owner-implementation.manifest.json
  implementation-profile.json
  source-metrics.json
  query-plan-evidence.json
  acceptance-results.json
```

The manifest must bind:

- the accepted N02 contract and owner-pack manifest digests;
- exact 40-character implementation commit;
- immutable `linux/amd64` image digest;
- byte SHA-256 for all four evidence files;
- source-owner identity, acceptance timestamp/evidence and authority envelope.

The evidence must pass all 14 named scenarios in the delivered
`acceptance-results.example.json`, including:

- correct/missing/wrong/revoked identity;
- GET-only fixed scope;
- lease expiry with zero source SELECTs;
- baseline watermark and counts;
- ordered UPSERT and DELETE tombstone;
- duplicate/replay idempotency;
- cursor ahead/expired/gap and new-epoch resync;
- restart and source-loss recovery;
- rate/RSS/queue/backpressure limits;
- rollback to dormant v1-compatible state.

Required sanitized observations are at least:

- 30 minutes after lease expiry with zero source SELECT and byte deltas;
- 100 or more active requests;
- one full baseline;
- zero ordinary-delta full scans;
- zero source errors;
- reviewed incremental plans for orders, fills and positions with no ordinary
  delta sequential full scan and amplification within the declared bound.

Do not include SQL text, credentials, DSN, certificates, API keys, business
rows, account/strategy/instrument identifiers or customer data in the return
package.

Owner-side final check:

```bash
python3 verifiers/execution-n03-implementation-verify.py \
  --mode acceptance \
  --pack-dir /home/bobby/portal-n02-n03-v2-return/n03-owner-pack \
  --n02-pack-dir /home/bobby/portal-n02-n03-v2-return/n02-owner-pack
```

## 7. Runtime and rollback discipline

Implementation acceptance is not Portal activation.

During the bounded owner window:

1. record the exact source commit/image/config digests;
2. start only the loopback facade and existing Source Proxy boundary;
3. run the identity, lease, incremental, failure and load matrix;
4. stop lease demand and collect the 30-minute zero-idle-source evidence;
5. stop the v2 facade and restore the dormant v1-compatible state;
6. prove no remaining source session, recurring SELECT, reader container or
   unexpected listener;
7. publish the two accepted packages without runtime secrets.

Abort and restore dormant v1 on scope/method widening, source mutation,
credential leakage, full scans during ordinary deltas, unbounded memory/queue,
cursor ambiguity, gap suppression or failed cleanup.

## 8. Portal action after owner return

Portal will, without asking Bobby to approve N07/N08 again:

1. copy only the nine non-secret JSON files into isolated staging;
2. verify N02 and N03 in acceptance mode and compare byte digests;
3. import accepted contracts/evidence in one contract-only commit;
4. wire the already-built N04 Rust shared consumer to the accepted v2 schema;
5. run N06 `PAPER_FAST_ACCEPTANCE` for 1,800 seconds in a monitored background
   container;
6. atomically accept N07 and N08 for the exact Paper scope if all real gates
   pass;
7. run negative probes and rollback rehearsal before changing the registry
   delivery profile.

`EXTENDED_24H` remains later release-confidence evidence and is not a duplicate
Paper-shadow approval gate.

## 9. Definition of done — return one complete handoff

The Trading System owner/agent returns one concise completion report containing:

- branch, implementation commit and immutable image digest;
- N02 and N03 absolute return paths;
- both verifier outputs in acceptance mode;
- sanitized test/idle/load/query-plan/rollback evidence summary;
- confirmation that v2 is dormant after the window and v1 rollback is intact;
- any single unresolved external blocker, consolidated once.

Do not return a partial “implemented but evidence later” phase. Do not leave
TODO placeholders, duplicate contract definitions or a permanently running
qualification facade. If acceptance fails, leave runtime dormant and report the
one exact failing gate with its evidence path.
