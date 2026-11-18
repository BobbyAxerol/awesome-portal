# Execution catalogue v1 — EPG10-02

Logical contract freeze, **not an activated exporter, listener or producer
acceptance**. Governing journal: [unified plan §23.11](../../../../upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2311-epg10-02-contract-freeze--2026-10-16-asiasaigon).

## Authority and reuse

`shared/` is a byte-identical mirror of Research ELP2-01 at
`docs/research-loop-plan@c1d6b2dc53f1f80ac44cdfd9d96d159c4e9aae64`:

- Schema SHA256 `7a28e0545005789da1a54d304dbf242a2413d464aa905b83d5641e40821c4828`.
- Synthetic FX-01…25 SHA256 `7b3044c2f4c990633a4550ab2c521f0fdf0108f9e70027bcbc1c2df02643cb75`.

Source: `/home/bobby/portal-research/packages/contracts/` on SGP; do not edit
the mirror to fix a consumer. Upstream JSON Schema owns the shared strict DTOs.
`execution-contracts::catalogue_v1` implements exact wire primitives and metadata
mapping. No new crate/service. Existing V1/Manager/maximum-data remain unchanged.
Current research BE specialist checkout is older than this integration pin.

## Package and source coverage

| File | Frozen responsibility |
| --- | --- |
| `registry.json` | 39 EDGE families +3 distinct BE views, owners, source roles, grains, history/retention unknowns, publication gates, explicit status adapters |
| `catalogue.v1.schema.json` | Versioned separate Family/Scope/Page/CursorContext/MetricEvidence/PM-R2/Regime/Dimensions/ScopedBrowser definitions; references shared schema |
| `field-dictionary.json` | Manager field catalogue, units, policy and per-field source/gap records; no new researcher disclosure |
| `metric-dependencies.json` | All atom/aggregate leaf owners, candidate source fields and absent proof; direct NAV score independent of raw alpha scores |
| `pm-controls-map.json` | Synthetic authority-field alias parity; canonical PM business payload untouched |
| `golden.json`, `mapping-golden.json` | TEST_ONLY contract vectors, not economic/runtime evidence |

42/42 are logical inventory rows, **not42 available endpoints**. New `edge.v1`
publication is disabled. Existing Manager current-page service is a different
surface and is not relabelled unavailable by this package. Re-inspected component
roles do not certify the legacy96 relation/field pack; it remains unaccepted.
Applied schemas, DB populations/history and producer identities were not queried.
Source gap owner and exact candidate/proof reference are recorded, never empty
successful history. P16 fixed Paper reader/manifest is not an all-family exporter;
its checkpoint is a journal-prefix artifact, not a full business bootstrap.

## Compatibility and wire rules

- Shared `edge.v1` is metadata, not a new scope/dataset/availability envelope.
  Browser `portal.snapshot.v1` is explicit. Unknown shared fields/enums and
  incompatible major fail; negotiate a new schema, never relax P16 unchanged
  resource guarantees. Only outer registry optional extensions are additive;
  unknown required features reject. There is no implicit new route.
- Decimal plain strings max128 chars, no float/fixed-precision rounding; opaque
  IDs/revisions max256 Unicode chars. Counts/UTC milliseconds are nonnegative
  JS-safe integers. Preserve RFC3339 source nanoseconds beside converted UTCms;
  timestamp is never journal ordering. Null, zero and absent remain distinct.
- Guide `OUT_OF_SCOPE` maps through `guide-to-foundation-status.v1` to shared
  `DENIED/RESOURCE_NOT_AVAILABLE` without resource IDs/counts/private reasons.
  Guide unresolved freshness maps to shared `UNKNOWN`; completeness remains
  independent. Source verification does not imply runtime availability/history.
- `edge-to-portal-metadata.v1` preserves upstream continuation **internally**.
  `execution.scoped-continuation.v1` is an explicit separate stage replacing it
  with BFF-issued cursor before public output. No raw upstream cursor accompanies
  the public response. Actual authorization/signing/server-held token storage is
  not implemented by this contract-only module. Dataset/principal/full
  scope/filter/auth revision/epoch/generation/snapshot/schema/expiry must match
  after authentication and current authorization; otherwise `RESYNC_REQUIRED`.
- Portal-derived generation needs lineage; source epoch stays unchanged. Missing
  source-bound coverage proof keeps facts/recorded-through null and completeness
  unresolved; emitted/observed clocks are never coverage proof.
- Shared no-proof mapping deduplicates reasons in insertion order. Rust rejects
  an output beyond32 reasons; upstream TS mapper can produce33 from32 unique
  reasons plus missing-proof marker. This is an explicit fail-closed output guard,
  not a changed shared schema or a runtime certification.

## Full retrieval and errors

The pure Rust reference paginator traverses an already authorized, immutable
snapshot ordered by a full unique key tuple. It is a **contract oracle**, not an
in-memory production exporter: runtime adapters must use indexed bounded queries.
Each serialized page includes its envelope/continuation in the byte limit and
also obeys row limit. Numeric limits are required configuration, not invented
production defaults. No total-row cap; no TOP-N masquerading as full history.
Duplicate/unstable keys fail. A record that cannot fit fails explicitly; it is
never skipped. Snapshot/source-floor loss or changed scope requires resync.

| Code | Required disposition |
| --- | --- |
| `INVALID_WIRE_VALUE` | Reject malformed/null/precision/time contract; no coercion |
| `UNSUPPORTED_SCHEMA_OR_REQUIRED_FEATURE` | Negotiate a supported schema; no silent major fallback |
| `RESYNC_REQUIRED` | Re-authorize and bootstrap a new valid snapshot/cursor |
| `UNSTABLE_OR_DUPLICATE_KEY` | Reject producer/query result; do not drop duplicate |
| `INVALID_PAGE_BOUNDS` | Fix required row/byte configuration |
| `RECORD_TOO_LARGE` | Explicit separately authorized bounded retrieval/error, never truncation |
| `SOURCE_COVERAGE_PROOF_MISMATCH` | Reject proof from another source-set/as-of cut |

These are contract codes, not new HTTP routes. Restricted responses contain only
safe public copy, not the private mismatch reason or target existence.

## Metrics and PM boundaries

Shared metric/score DTOs plus separate MetricEvidence retain currency, requested/
effective windows, denominator, source-set/checkpoints/watermarks, revision/
supersedes, ACL scope, Original/Restated and conditional Research run. P/R/B and
six weights/bands are fixed; production config/calibration remains policy_pending.
No score calculator, scheduler, watch or mutation is introduced.

ADD is arithmetic mean on the locked complete regular grid including zeros,
excluding E0; Sharpe inputs are not annualized. Stress is exactly one fixed-path
additional-cost scenario using fill-side gross notional, FX/instrument semantics,
positive opening subperiod capital and baseline net returns. It does not optimize
scenario windows or double-charge baseline costs. Point equity snapshots alone
are not a flow-neutral NAV/return series; unknown fees/turnover never become zero.
Direct portfolio scoring uses consolidated unique economics, not q/HHI/grouping/
Regime/Research-run availability unless the chosen evidence is Research-derived.

Budget/requirement/backing/exposure/capacity/locks/recall remain independent;
exposure policy is product/model/unit/netting-bound, never global1×. PM HTTP
counter strings and original `pma.capital-command.v1.1` bytes stay unchanged.
`RETURN_CAPITAL` component support is not candidate/runtime activation.
Canary is financial stage under live environment; Archive is lifecycle, and
TradeState independent. Clone lineage never implicitly closes/liquidates/orders.

## Reproduce and test crosswalk

Check the shared-host measurement lock before tests. Python dependencies reuse
installed `jsonschema` (validated with4.10.3); no install/network required:

```sh
python3 -B -m unittest discover -s scripts -p test_execution_edge_catalogue.py -v
# Rust1.85.1, bounded jobs/threads, external owned target/cache:
cargo test --locked -p execution-contracts -p manager-v2-contract -p maximum-data-contract
cargo fmt -p execution-contracts -- --check
cargo clippy --locked -p execution-contracts --all-targets -- -D warnings
```

T02-01…11 are mapped by named Rust/Python tests; FX-01…25 imported facts are
schema-tested as published, including expected negatives. ELP2-T01/T05 are guide
crosswalks, **not claims that partner runtime acceptance was executed**:
T01-01…15 identity/precise wire/registry/Archive/metadata align FX01…17;
T05-01…13 analytical source/basis/status/cost/allocation/direct-NAV align
FX18…25 plus T02-07…11. Formal receipt in unified-plan-linked02 evidence.
