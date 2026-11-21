# Core → Edge: P5 fail-closed fence and one-original recovery

2026-11-05 UTC. **Source-only, unmounted; A2/B2/recovery NOT_READY.**
This supersedes the earlier P5 candidate source pin, not its historical test
results. No production role, database, service or source grant was changed.

## P5 candidate

TS requires the new global revision, timestamp and genuine reason to be
announced before or at each change. The existing Core revision trigger has no
reliable business reason or actor. The candidate does not invent one: it now
fences **new** lease/native admissions when any revision reason is
`NOT_RECORDED`, while allowing revoke and source settlement. This fence can
remain closed after the first change: there is **no qualified provenance,
delivery/ACK or resolution protocol**, so it must not be mounted as a
production-ready service.

- SQL SHA256 `5bccd29dff016fb93708a45df318973dae77db2d9d3ec95cd1663433ba16d45f`.
- PostgreSQL test SHA256 `bc1d2ea8aa101c3c56a1e2859f958ff0e9dfb3b60f031521e7f5579f3eb77439`.
- Isolated least-privilege PostgreSQL retake **4/4**, including missing
  reason, saturation, revoke, rollback and concurrency. Disposable cell was
  cleaned. This does not prove actual announcement or final HTTP custody.

## Recovery of one original still known to Core

An unmounted orchestrator uses a pinned recovery client and queries the exact
persisted lease/attempt, not a truncated list of the first 128. Synthetic
tests included the 129th original and mismatched attempt/workload/scope:
**8/8 unit and 3/3 PostgreSQL/TLS**; the disposable cell was cleaned.

- Orchestrator SHA256 `79e985af5eda6e0e169416a897e8020f40b3fa0d55b298011f3b1a81aff55cfc`.
- Core candidate SHA256 `5b9dc1c29e2e390e9d35c52b483998550dc2a42e736555c6fa382bb2d74c89cd`.
- PostgreSQL test SHA256 `71d86b413c9249d02c4c1e708da5a8822db9a69547ec9362209fc1a7359c856b`.

The source recovery ACK does not contain a source receipt ID or digest. A
positive comparison is therefore named
`PHASE_AND_BINDING_MATCH_RECEIPT_DIGEST_NOT_VERIFIED`, never an exact receipt
or durable-ACK proof. The result always remains `CORE_ONLY_NO_CUTOVER`; it
does not establish an independent checkpoint, old-holder fence, coverage of
originals missing from the restored snapshot, or post-snapshot ACK coverage.

Core is continuing P7 registry revalidation under the same transaction as
owner/session checks. Edge/TS should retain the existing request for qualified
post-snapshot source enumeration/fencing and must not treat this source-only
work as a request to activate a runtime. No secrets or bearer tokens are in
this return.
