# §55 — Native Search / Freeze / Report backend delivery

Status: BACKEND_SOURCE_DELIVERED / REAL_RETAINED_CANDIDATE_PASS;
FRONTEND_CONSUMER_AND_BROWSER_ACCEPTANCE_PENDING. Not P24/release.

## Implementation

- Private signed preparation verifies P05 manifest, every part/document and
  exact run/workspace/input bindings; reads bounded Parquet after schema,
  row-count and decompression-budget checks. No QuantBT invocation.
- Append-only local sidecar uses exact artifact/profile/input bindings,
  tenant RLS, least-privilege role and membership, finite read/DB budgets.
  Migration127 creates it;128 adds immutable transform versions. Both the
  earlier minimal candidate projection and the richer metadata projection
  remain stored; no artifact or old Report seal is replaced.
- S06/S07 use additive DTOs on existing authenticated routes. Native ledger
  pages cap at200, full population at400; actor/source-bound opaque cursors.
  Parameters/objectives/metrics are exact decimal strings; PRUNED is typed
  null, never a sentinel zero.
- S06 exposes actual engine-selected medoid and retained plateau metadata.
  S07 carries selected parameter hash, original child table SHA, P05 part SHAs,
  preparation-time integrity and fresh explicit Verify's existing byte result.
- Reports seal local native optimization/account/window facts and export by
  the existing caller/revision-bound durable JSON/CSV flow. Native fixed
  Reports have no fabricated optimizer. Existing WFO cores stay unchanged.

P08 preflight manifest SHA is not P05 artifact-manifest SHA. The reader joins
by exact run/profile and requested/effective/dataset digests rather than
incorrectly equating those hashes.

## Real retained-data acceptance

Script: `scripts/research-p23/native-read-report-proof.mjs`.
Authority: **candidate modules on the actual isolated preview DB and actual
verified P05 bytes inside the pinned preview Portal API image**; no deployed
HTTP/browser claim from this proof. Private transport alone is substituted
with the real verified result because the old runtime lacks this new route.

- Optimized run: `rrun_ee50cb82d6de9e495e10b32323b62f8c`.
- Workspace: `ws_06GCVTHWC9WVPGEPR85AB15K82`.
- 100 complete/retained trials, 98 distinct parameter sets; 5 pages of20 read
  each trial exactly once. Selected engine trial41 / display ordinal42 agrees
  across S06, S07 and Report.
- Selected parameter digest:
  `a376293b5fd90f390314f632f8450a6d6bc009c4ed263698d7a58288ea2c353f`.
- Projection v2 digest:
  `108e382df483633880d4e658975fcbd681bed4e589b71aa58e2fbe261272c9ac`.
- Report revision:
  `p18r1_bb186ae56d7dcb458ce00f5bc79d902d0b4805a6aa1c647b1d8f401bb978ac37`.
- JSON62,301bytes; CSV12,920bytes; normal job→READY→download checksums match.
- Repeated prepare preserves projection hash/observation time; repeated seal
  preserves Report revision. Nonmember403, unknown run404, forged cursor400.
- Source P05 manifest and lifecycle/state version/updated_at unchanged; WFO
  `rrun_cf5ed033560082488b559baf29be4754` Report core digest unchanged.
- Additional native fixed Reports: Limit/OCO
  `rrun_7c6aff8dc45f1781887527c2bf970f2c`, Bracket v4
  `rrun_c2329924a32a26e8d9d5bf9d5c1f809a`, Reactive v3
  `rrun_fbf968c1075a2b020a03bd04fd7a8024`.

Private proof: `/home/bobby/.local/state/portal-research-p23/20261009-native-read-report-delivery.json`;
SHA-256 `3b44d783e7ba2ad3d53fe2af4459738c1d28be144d96d87ddff8f7e1ddcb84ac`.
Canonical public DTO fixtures come from that real candidate, not sample engine
values. Public fixtures include no filesystem locator/principal/lease/key.

## Gates and deployment boundary

- Focused Control API Search/Freeze/Report/native/absence:35 tests PASS; build PASS.
- Python sealed-Parquet, corrupt-byte/binding, no-side-effect and private
  authentication tests:8 PASS.
- OpenAPI/generated clients, canonical fixtures:19 tests PASS; contracts
  snapshot parity:348 files match; generator --check idempotent.
- 400-row unit proof includes selection beyond the first200-row page.
- Normal repository hook once for the coherent delivery; no bypass.

Deployed acceptance script: `scripts/research-preview/native-read-report-readback.mjs`.
It checks installed signed preparation, authenticated S06/S07/Report,100-row
paging, conditional304, fresh Verify, fixed-native Report regressions,
JSON/CSV download checksum, foreign-workspace404/anonymous401/forged-cursor400,
and revokes only its own review session. The authoritative deployed result,
actual image/source identity and responses are persisted in
[the private runtime receipt](/home/bobby/.local/state/portal-research-p23/20261009-native-read-report-http.json).
The script writes that receipt only after all checks and session cleanup PASS;
absence of the file is not acceptance. This source packet does not infer an
HTTP/browser PASS from its candidate proof. The runtime JSON is evidence, not
a reason to rebuild an unchanged web image or rerun the engine.

Native Holdout remains source-not-executed, member identities and sampler
internals not retained, wall-clock freeze events not published. Typed
boundaries are not invented AVAILABLE values or scalar-WFO certification.

## Capacity / closeout decision (before scoped backend rebuild)

Read-only snapshot: root621G, used530G, free91G (86%used); RAM31Gi with14Gi
available. Docker:273images/25active;87.79GBimage store;189.9GBbuild cache.
The named deploy runner unit was inactive; no runner was changed.

Capacity decision: **bounded cached backend-only rebuild** of Control API and
Portal API is accepted within this preview slice;91G free, no dependency/image
fleet or frontend build, no new volumes/stack. Use canonical checkout and the
existing scoped preview helper; preserve in-flight children (helper refuses
rollout while active), DB/NATS/web data and web image. Record actual IDs and
health after rollout. This is not permission for broad pruning or release.

Phase cleanup: **NO_ACTION_NEEDED** for phase-created infrastructure: no test
stack/volume/runner or engine scratch created. Retain named proof JSON and
immutable sidecars/Reports as evidence. No image/volume/cache pruning while
Claude's preview work or this rebuild is active. Shared-host cache pressure
belongs to the documented quiet-window operational cleanup, not data deletion.

[Claude handoff and exact exit gates](./NATIVE_READERS_CLAUDE_HANDOFF_2026-10-09.md).
