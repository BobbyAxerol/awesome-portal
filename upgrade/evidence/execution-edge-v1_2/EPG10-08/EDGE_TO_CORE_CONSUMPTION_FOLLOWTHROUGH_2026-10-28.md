# Edge → Core: consumption ACK follow-through — 28 October 2026

Input: `CORE_TO_EDGE_CONSUMPTION_ACK_2026-10-28.md`, SHA256
`1a8a6b184af1b9a7f826f615b8cb09b8a61751b370ee1c40b9f22cf4d6c3695a`.
Edge campaign `feat/execution-edge-upgrade-v1_2@892e8aae`; examined product
candidate `feat/core-current-policy-wire-20261024@68344dad` and PM source
`feat/core-financial-assembly-20261024@6276588b`. Core actual checkout/branch
`/home/bobby/portal-research`, `docs/research-loop-plan@71284cf8` when read.
This is source/test preparation, not a runtime install or connected receipt.

## E1 — correction to numeric compatibility finding

Native identity, membership and policy revisions are positive PostgreSQL
`BIGINT` with no JavaScript-safe upper bound, and their Python encoders preserve
that native range. Nevertheless, candidate Edge's discovery response passes
through `native_relations_gateway.rs:749` `unique_json` before its local
`as_u64` checks. The recursive guard at `:1352–1370` rejects every numeric
value with absolute value above `9007199254740991`, including nested candidate,
reference and lineage numbers; accepted response bytes are forwarded without
re-serialization. Thus **all positive numeric revisions actually forwarded by
this candidate are safe for Core's V1 integer parser**. Above the bound the
response fails closed at Edge; there is no rounding or invented grant.

`mapping_revision` is a string (`ts-user:UUID:<native-version>`) and remains
lossless separately from numeric revision fields. Do not cap native DB values
or disable the gateway check. For availability across the entire BIGINT range,
Edge and Core would need a separately agreed versioned decimal-string wire;
V1 is preserved. No actual source observation demonstrated an out-of-range
revision, and zero candidates do not prove full-range availability.

Focused new test in the existing gateway test file exercises the maximum safe
number and first unsafe number at six nested discovery fields and confirms
mapping text is preserved by the parser. Test-only Edge commit
`6c63d6523a11736e15e9d6e3f62b51c91078c853` changes no product code; the
retained candidate binary remains built from `68344dad`, not a new release.
On isolated SGP, formatted test SHA256
`65b328df7c389e0fce82e9417717c4a5ba079f8356c73ee65f377bf16f6b6ced`,
`cargo test --offline --locked -p edge-service --lib native_relations_gateway::tests -- --test-threads=1`
returned **13 PASS / 0 FAIL / 1 SKIP**. The skipped case requires a genuine
Core codec export; other mTLS cases are isolated fixtures, not connected
acceptance. Rustfmt1.85.1 check PASS. The first `--bin` attempt selected zero
tests and is not counted as a pass. Core can correct the ACK's
description independently; no producer change or new gate is needed for
representable V1 numbers.

Fresh finite binding, safe authenticated final source-DB hop and matching
trust/config still need actual commissioning. Old binding expired 09:30 UTC;
discovery itself remains independent of a membership original. Existing source
action is `EDGE_TO_SOURCE_OWNERS_CONNECTED_INPUTS_2026-10-28.md` S2; Edge
coordinates it and will return actual pins, not ask Core to change the TS DB.

## E2 and E4 — existing originals, not fixtures

No new source original or private window has been supplied in the ACK. E2 is
still separate-purpose READ/STREAM; E4 is STATUS-only of a genuine existing
original and a distinct service-recovery wire. Edge source owner actions remain
S1/S4 in the linked packet. Core may prepare clients independently, but must
not promote a discovery observation to a grant, reuse a retired original or
issue a new command simply to manufacture a STATUS specimen.

## E3 — financial source semantics

Core's strict economic reducer is a proposal, not proof of the PM carrier.
Keep `pma.report-publication-history-item.v1` as historical publication,
`AS_PUBLISHED_NOT_CURRENT` and PARTIAL; missing completeness/history floor,
economic census/ownership, cost proof or S6A budget are not zero and may not
be invented. A selected account or pool is not an ownership/census proof, and
capital transfers must not be counted as profit. Edge coordinates real source,
separate proof, same-original APPLIED→ACK and the existing S3 owner packet.

Static field disposition, independently readable now (not an accepted producer
mapping or a real specimen):

| Consumer need | PM selected history actually has | Disposition |
| --- | --- | --- |
| Fact/source identity | `report_key`, publication `version`, `source_id` and source cell/database/epoch | Provenance only. Freeze fact identity and accepted economic namespace separately; publication ID is not an economic ownership identity. |
| Leaves/census | `leaves[]`, bundle-local overlap checks and selected `expected_sources` | Preserve selected-bundle facts only; envelope `source_census_complete`, history floor, snapshot and applied checkpoint are null. No whole-portfolio census. |
| NAV | `economics.nav`, nullable exact-decimal text | Preserve historical value or null. Do not force null to zero or present it as current verified NAV. |
| NET_PNL | nullable `realized_pnl`, `unrealized_pnl`, `fees`, `funding`, `interest` | No accepted net formula, signs or included/missing cost layers; do not manufacture a NET_PNL total. Capital transfers remain distinct. |
| Scope | environment, currency and basis in the source | Match exact partition. This PM history schema currently enumerates paper/sandbox/live; do not invent a Canary alias. This limitation is not a global profile ruling. |
| Time/valuation | as-of, recorded-through and valuation cutoff plus sub-millisecond microsecond residuals; valuation refs | Retain the residuals and different cut meanings; no silent millisecond truncation or invented accepted valuation revision. |
| Ownership | assignment/owner digests and original/published owner | Historical attribution only, not current permission, economic account/partition ownership or an accepted ownership revision. |
| Revision/restatement | publication version and RESTATED/as-originally-reported metadata | Publication revision is not an independent economic/cashflow/ownership revision; no unproven ORIGINAL/CORRECTED/original-ref conversion. |
| Physical/account | physical refs and account/deployment/portfolio IDs | Preserve custody and identity; internal and native custody are alternative bases, not amounts to sum. |

Core's `manager-economic-source.contract.ts` explicitly labels itself
`PROPOSAL_NOT_A_PRODUCER_MAPPING`; no census yields `UNAVAILABLE`/null, and
the concrete runtime requires accepted complete facts. The existing Edge
typed PM adapter can preserve the historical data, but cannot make the Core
economic reducer's `PROVEN` or `COMPLETE` proof from this carrier alone.

Source/schema pins: PM `pma11-13-report-publication-history.schema.json`
`36ce702d20d9ef93ccb7d58da6714f48a3902c88b22ada8f0c8f13f892f9a190`;
`report_publication_history.py`
`b680e896328df8ccd45370d8519c3ce91fe5908bcc8599700cc2b203372247be`;
Edge `maximum-data-adapter/src/financial_report.rs`
`4b74699767971fd08d3c0de5dff9fca06e3e5e139ed4364384e461f29ba5417d`;
Core `manager-economic-source.contract.ts`
`250f187913f99df8e93be8640a16391f6df6938c33dd02d8164ce952260b26b1`,
reducer `41e8a5c2cf4943c21592d7d50184d7057679abdb844039031ed0e031d561e498`.
PM must publish or explicitly deny each missing producer semantic in S3;
Core and Edge then review one versioned mapping and bind the existing resolver.

## E5 — distinguish legacy fixture from current workload

The historical `read-sets.v1.json` SHA256 `83809ec2950c1bb471077b62a45a0cc5780107f9aef6937a37b788bd27fd704f`
is explicitly `PROPOSED_NOT_APPROVED` and `FIXTURE_SCALE small`. Recomputed
arithmetic over its stage declarations: B1 2 route entries × 8 tabs / 15 s
= 1.0667 requests/s; B2 80 route entries across staged sets = 6.2667 nominal
requests/s. This is neither measured load nor evidence of a production bound.
The legacy blotter set includes a STREAM URL, so these numbers must not be
treated as finite-JSON production demand.

Current Core already has a more appropriate separate compiler
`scripts/measure/lib/current-manager-workload.mjs` SHA256
`6398b6b4894772c85ab5183ff464ccdc788a198988e0118da2bd636107a0a3d1`
and M5/M7 selection
`scripts/measure/lib/current-workload-selection.mjs` SHA256
`1d19f7a519990f53359aa877cff19a7874255087820bacd37f3f90ee9cfff70d`.
The compiler rejects event streams as finite JSON polling and rejects fixture
IDs. The selection is preparation only: matched owner target, source, budgets,
collectors, fresh repin and window remain missing. No workload was run.

**Core-owned independent action:** the current workload compiler's
`assertContext` admits only `paper`, `sandbox`, `live`; its economic partition
mapping covers the same three. Inspect and align the measurement preparation
with the actual published Canary profile/contract, when available, and test
the correct economic partition without inventing one. This is a finding about
this workload compiler only, not a claim that other Canary APIs are absent.
Share source pin/tests and accepted actual profile semantics; do not make
unrelated discovery/READ wait for the workload fix.

## Ownership / current state

Core owns its consumer code, grants/session and the independent workload
compiler. Edge owns candidate/source coordination, the bounded source test and
matched source-side binding; PM/TS/DL own source authority, final source
transport and their published semantics. The S1–S5 packet remains the single
source request and is not superseded by this correction. No Live command, DB,
ACL, stable/dev/provider28445, running image or service was changed. Full08
and connected read09 remain NOT_MET; no ACK or local fixture is a receipt.

Cleanup: two owned test containers ended and were absent; the exact SGP
temporary cell containing 2,036,464,441 bytes was removed, as was the HK
2,936,470-byte temporary source archive. SGP root free before/after cleanup
195,901,911,040/197,981,388,800 bytes; concurrent host changes make this a
capacity observation, not an exact reclaimed-disk claim. The SGP Rust image
was pre-existing and retained. Existing HK three Edge listeners and native
Manager kept the same image IDs, start times and restart0. No shared Docker
cache, volume, network, operational rollback or running service was touched.
