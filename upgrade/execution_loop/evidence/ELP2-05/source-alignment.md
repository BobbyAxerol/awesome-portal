# ELP2-05 source alignment — 2026-10-16 UTC

Read-only SSH to `bobby@16.163.212.33`, hostname `ip-172-31-16-126`.
No remote edit, test, DB query, runtime/load probe, credential or service change.
Parallel source observations are not an atomic deployed-state attestation.

| Worktree | Branch / full source SHA | Observed state |
| --- | --- | --- |
| TS `/home/bobby/.worktrees/trading-system-next-upgrade` | `feat/v2-rust-first-okx-demo` / `c2035b41700c27ce810406a59dffeb259c621ea0` | Seven modified market-data health/session Python/Rust/test paths; untracked PM guide copy. Preserved. Not the PM R2 authority. |
| PM `/home/bobby/.worktrees/trading-system-pm-v1_1` | `feat/portfolio-account-v1_1-parallel` / `d16aa2b5f251596e469807f57e81fe14cdc7e763` | Clean at observation. Current R2 guide SHA256 `7d79d8de84eab19d0d2de3dce2b4c9278a691277b0b8b4379a7db0000dfc8945`. |
| DL `/home/bobby/.worktrees/data-layer-p184-closure` | `fix/p184-dl-closure` / `18c888fa6a568c66fb62606d882e34352973e8f7` | Clean at observation; no DL load/test performed. |
| Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` | `feat/execution-edge-upgrade-v1_2` / `e77a8ed0b6983880b646d17088f8f3c1581d4f86` | Dirty EPG10-05 scoped-read/query/SSE work, including untracked migration0020. Neither consumed as frozen wire nor changed. |

## Exact imported logical source contracts

Edge prefix: `services/portal-execution-edge-rs/contracts/execution-catalogue-v1/`.
Copies in `packages/contracts/fixtures/execution-publication-source/` are exact
contract bytes, **not business rows or positive runtime fixtures**. Generator
and contract tests check SHA256 before compiling the safe inventory.

| File | SHA256 |
| --- | --- |
| `registry.json` | `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67` |
| `field-dictionary.json` | `aca5c54cce66becbf47ef32d30799e9dfe75a4f3d51df4e3ade0e89c53cbec7e` |
| `metric-dependencies.json` | `9c945880e821ecec4b5f56f85c5de15d506817cb07984300b824b4f5390c5a31` |

The registry itself pins older TS/DL source revisions. Preserve those embedded
pins; do not rewrite them to today's worktree heads and pretend recertification.
It explicitly states39 Edge families +3 Portal views, all new exports
`UNAVAILABLE / NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, `history_full:false`, unknown
retention and no enabled environment.31 field declarations have separate
source locators and unqualified numeric publication. Formula approval is true;
runtime calibration approval is false. These are SOURCE_CONFIRMED contracts,
not RUNTIME_VERIFIED exports.

## Actual integration limits

- EPG10-03 capture return: phase exit NOT_MET; T03-04 has the stale publisher
  generation counterexample, `BLOCKED_SOURCE_FENCE_ABSENT`. A source journal
  counter or timestamp is not a commit barrier. Source/Edge owner must fix and
  provide selected writer/partition/epoch evidence before authoritative tail.
- EPG10-04 isolated PostgreSQL/synthetic-input receipts are reported PASS,
  not a source-connected Portal receipt. Source-connected snapshot/overlap,
  source fence, retention, current authority and capacity gates remain open.
- Dirty EPG10-05 `portal.scoped-read.v1` is not mounted. It is not a new Portal
  URL, not accepted deployed wire, and projection commit time is not economic
  source-as-of. No import of the WIP schema or speculative generic proxy.
- Historical Manager Paper owner publication SHA256
  `2be9b46313e71f282891d88d0afca1eed2bf6c5df49f1fe8b610f6350d215da4`
  declares private Paper qualification,200 rows/1MiB and bounded mTLS/JWT.
  Its runtime overlay says owner loopback passed/cleaned up but Portal was not
  reachable. This is HISTORICAL_EVIDENCE, not today's TLS/SLA/source receipt.
- The established Portal96-relation/54-operation current-page surface stays
  separate. Its existing policy/field/transport gates are not replaced by this
  new logical catalogue. Current pages are not stable multi-page snapshots.
- TS `services/portal_execution_owner/manager_facade.py:131–135,600,740,962`
  serializes Python microseconds for source and record clocks. The bounded
  adapter accepts explicit-zone RFC3339 with0–9 fractional digits and derives
  public UTC milliseconds by flooring, while leaving the source envelope intact.
  It rejects invalid calendars, missing zones and malformed offsets. Do not
  use sub-ms values as public exact-time/event-order claims.

Review contribution: independent Edge source audit plus a separate local
catalogue audit. Their findings were reviewed by primary; no agent performed
remote writes or independent runtime activation. The microsecond regression
found in the first strict-parser patch was corrected before landing.
