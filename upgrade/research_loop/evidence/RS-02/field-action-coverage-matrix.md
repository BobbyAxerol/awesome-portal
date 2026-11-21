# RS-02 field/action coverage matrix — named S04–S08 reads

All rows use generated `research-current-source.d.ts`. `DIRECT` means exactly
retained from the P05-verified Advanced-WFO result; `DERIVED_AT_SEAL` means
computed once while the confined producer holds the source result. Neither
means browser-side calculation.

| Screen | Named BFF / fact | Coverage | Local retained source | UI/action rule |
|---|---|---|---|---|
| S04 Evidence Hub | `evidence` passport, direct metrics | `DIRECT` | sealed summary / observations | show exact decimals, UTC/as-of and revision; no alternate metric computation |
| S04 | `evidenceSeries` `EQUITY`, `RETURNS`, `POSITIONS` | `DIRECT`, bounded sample | `OBSERVATION` | chart may disclose `RETENTION_STRIDE_V1`; sampling never changes metric values |
| S04 | monthly, rolling-20, distribution | `DERIVED_AT_SEAL` | immutable summary | show returned values/coverage only; do not recompute in TSX |
| S04 | benchmark, audited fills, route ledger | `NOT_PUBLISHED` | none | retain the specific panel with its reason; never zero/fixture it |
| S05 Split | actual folds / IS / OOS boundaries | `DIRECT` | `FOLD` | show only source UTC-ms/count conventions |
| S05 | warmup, purge, embargo, strict outer-OOS, physical holdout I/O | `NOT_PUBLISHED` | none | preserve rich anatomy panel with exact typed absence; do not infer causal/holdout proof |
| S06 Search | trials, candidates, selected row | `DIRECT` | `TRIAL`, `CANDIDATE`, `SELECTION` | use returned total/keysets; selected/raw-best/inspected must remain distinct |
| S06 | objective breakdown, pruning, importance, interaction | `NOT_PUBLISHED` | none | no empty diagnostics chart interpreted as a completed study |
| S07 Freeze | manifest/count/retained batch receipt verification | `DIRECT_LOCAL_VERIFY` | immutable seal + import receipt | show `MATCH`/`MISMATCH` narrowly as Portal retention verification |
| S07 | P05 artifact bytes, historical what-if/evaluation | `NOT_PUBLISHED` | none | no fake chain-integrity pass, slider, POST or background job |
| S08 Replay | model positions/returns and state-at-playhead | `DIRECT_RETROSPECTIVE` | `OBSERVATION` | fetch explicit bounded pages only; local playback advances loaded points without per-frame requests |
| S08 | order/fill/candle/broker/execution state | `NOT_PUBLISHED` | none | preserve panels with typed reason; never call it authoritative execution replay |

## Interaction contract

| Interaction | Allowed request | Bound / state | Prohibited inference |
|---|---|---|---|
| lazy chart tab | `GET .../evidence/series` | one listed evidence kind, max 200 output points | browser financial math or raw relation request |
| trial/candidate navigation | `GET .../search` | opaque `cursor` / `before`, max 200 | hand-built keyset or table selector |
| freeze verify | `GET .../freeze` | immutable local seal verification | source artifact re-open, what-if job or digest derivation |
| replay seek | `GET .../replay?at=<opaque token>` | relation-bound playhead only, `private,no-store` | `at_ordinal`, route ID, source cursor or retry loop |
| playback | no request per frame | already loaded rows only | market/broker/order/fill lookup |

Every unavailable/partial/legacy/error state remains panel-local inside the
HiFi composition. Whole-route generic `Unavailable` screens, direct source
paths and manual error-string parsing are contract violations.

The local importer retains P05 custody metadata separately but strips raw
fold/candidate payloads from the named screen DTO boundary. Parameter maps are
limited to 24 declared fields before retention; a source result outside that
admission is rejected rather than producing an oversized response.
