# P16 backend and contract packet — current-source Freeze / retained integrity

> **Current status 2026-09-26 (Claude, owner ≤P21):** P16-B is no longer source-blocked — A10a/b/c delivered by W5a ([record](./W5A_A10_CLAUDE_2026-09-25.md)): byte-verify receipts, historical binding, 9×9 what-if with a bounded job and sibling attempt; T02/T11 closed. CG-P16-02/03 (Stage-4 binding BOUND, parameter authority, P16-T14) and θ* digest copy closed by X2 ([record](./X2_P15_P18_GAPS_CLAUDE_2026-09-26.md)). Open items live in [Unified §13.4.1](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-open-ledger) (OL-02). The text below is the original packet.

Status: **BACKEND_CURRENT_SOURCE_CONTRACT_COMPLETE; feature-dark.** This packet
closes P16-A for the installed fixed P04 source. It does **not** claim full
artifact-byte verification, causal wall-clock ordering, an optimizer candidate
pool, a selected-trial artifact, a diagnostic grid/job, sibling draft,
browser acceptance, runtime activation, deployment, or `PRODUCT_ACTIVE`.

Read [phase-report.md](./phase-report.md) and
[frontend-handoff-claude.md](./frontend-handoff-claude.md) before changing
Screen 07.

## Two named generated operations

| Generated operation | Same-origin route | Bound behavior |
|---|---|---|
| `researchFreezeDetailGetV1` | `GET /api/v1/quantbt/runs/{runId}/freeze?workspace_id=&fold=` | one session/workspace/run, optional `fold=1…256`, one immutable P14 projection, revision/ETag |
| `researchFreezeVerifyPostV1` | `POST /api/v1/quantbt/runs/{runId}/freeze/verify?workspace_id=&fold=` | origin/CSRF-protected explicit re-read of exactly the same retained facts; no persisted verification or work submission |

Neither route accepts a source relation/revision/cursor, worker identity,
lease, artifact/path, raw market input, credential, parameter override,
diagnostic/job, command or CLI authority.

## Exact P16-A truth boundary

| Freeze surface | Current source fact | P16 result |
|---|---|---|
| local adapter binding | compiled P04 release digest + immutable producer binding | retained `P04_ADAPTER_CONTRACT` comparison |
| producer/source chain | P10 producer manifest + P14 source manifest | retained `P10_MANIFEST_BINDING` comparison |
| frozen parameters | fixed P04 declared range/value + P14 bundle digest | exact decimals only when the bundle binding matches; table is empty on mismatch |
| source artifact bytes | P14 physical I/O is `NOT_ATTESTED` | source gap, never an integrity PASS |
| pool/selection/trial/order clocks | P04 publishes none | individually typed `NOT_APPLICABLE` / `NOT_ASSERTED`, no inferred IDs or timing |
| what-if/grid/diagnostic/sibling | P04 admission rejects them and publishes no grid | typed `NOT_APPLICABLE`, `may_submit=false`, `may_create=false`, no client-side evaluation |
| explicit verify action | user requests a fresh same-origin read | `PARTIAL_MATCH`, `BLOCKED` or `NOT_PUBLISHED`; no audit row/job/mutation |

`PARTIAL_MATCH` means only all three **Portal-retained digest bindings** match.
It never means “chain intact,” artifact bytes verified, causal ordering proven,
or a selection was replayed.

## Feature and rollback

`FEATURE_RESEARCH_FREEZE=false` by default. Enabling it later allows only the
bounded P16 read contract; it starts no worker, source adapter, cache,
diagnostic job, database migration or Execution component.

Rollback is a signed release with `CONTROL_API_FEATURE_RESEARCH_FREEZE=false`.
Retain P10/P14 facts and do not delete evidence, restart a worker or access a
source database/artifact to compensate.

## Next owner

Claude owns Screen-07 product composition and direct browser-versus-HiFi
receipt. Use generated declarations only; see
[frontend-handoff-claude.md](./frontend-handoff-claude.md). P16-B needs a
future source-owner adapter contract, not manual frontend fields or a broader
Portal read.

## 2026-09-23 verification-scope amendment

`CG-P16-01` is closed by the
[verification response scope amendment](./contract-amendment-verification-scope.md).
The explicit verification result now carries its own top-level scope, so the
consumer never borrows that qualification from a separately cached detail
snapshot.
