# Native S06/S07/Report — Claude consumer handoff (§55)

Status: BACKEND_SOURCE_AND_REAL_RETAINED_DATA_DELIVERED. Frontend integration,
visual/browser acceptance and P24/release are separate. Preserve the accepted
HiFi/components, especially the S08 chart at `6fb34bd5`; Codex edited no frontend.

## Read first

1. Unified Plan latest §55 addendum and backend queue §55 (later addendum wins).
2. [Backend receipt](./NATIVE_SEARCH_FREEZE_REPORT_DELIVERY_2026-10-09.md).
3. Generated `research-search.d.ts`, `research-freeze.d.ts`, `research-report.d.ts`.
4. Canonical `research-native-{search,freeze,report}.valid.json` fixtures.
5. Specs/HiFi for S06/S07/S09 and the phase's existing consumer handoff.

## Exact consumer mapping

| Screen | Existing generated operation | Additive field / rendering rule |
| --- | --- | --- |
| S06 Search | `researchSearchDetailGetV1` | Prefer `SearchDetail.native_search` when present. It contains source trials, complete-candidate population and typed selection evidence. Old scalar ledger/diagnostic fields retain their old protocol meaning; do not use their absence to hide native data. |
| S07 Freeze | `researchFreezeDetailGetV1` | `FreezeDetail.native_freeze`: selected parameters, exact parameter/manifest/part hashes, exact selected trial and scoped verification evidence. |
| S07 Verify action | Existing `researchFreezeVerifyPostV1` | `FreezeVerification.native_freeze` accompanies the action's existing fresh `artifact_bytes` result. Historic `MATCH_AT_PREPARATION` is not a fresh byte check. MISMATCH/BLOCKED wins; no invented WFO certificate. |
| S09 Report | `researchReportDetailGetV1` | `ReportDetail.frozen_core.native_report`. `kind=NATIVE_OPTIMIZED` includes population/optimization/freeze; `NATIVE_FIXED` has these null because no optimizer ran. Both carry actual native route/account/cost facts and three window analyses. |
| S09 export | Existing `researchReportExportCreateV1`, `researchReportExportStatusGetV1`, `researchReportExportDownloadGetV1` | POST prepare job → poll → authenticated download. JSON has the full frozen core; CSV includes native parameters/selection/execution and window metrics. Keep workspace on every request. No legacy GET ZIP route. |

The generated Verify operation name is discoverable from `research-freeze.d.ts`;
do not make a new route or hand-parse its server strings.

### S06 pagination and selection

- Query `native_limit` (1–200; default200), then only the returned
  `native_cursor` with the **same limit**. Cursor binds actor/workspace/run/source.
- Native IS study has no outer-fold selector: omit `fold` on S06/S07/Verify.
  Do not forward the scalar screen's default fold0; the server rejects it400.
- `ledger.total` is full retained population, not this page's count.
- Engine `trial_number=41` and display `trial_ordinal=42` are separate facts;
  scope is `NATIVE_IS_STUDY`. Selection can lie outside the loaded page.
- The qualified real run has 100 complete trials, 98 distinct parameter sets;
  all 100 are readable. Candidates here are completed native evaluations,
  not the scalar-WFO candidate pool.
- `selection_process.retained_source_metadata` exposes the engine's medoid,
  center, counts, quantile/radius, plateau score, median/worst/std, parameter
  names and fallback reasons. Do not recompute a plateau or change θ*.
- Neighbor **identities** and sampler internals were not retained in this
  native source. Respect their typed reasons; metadata counts are not a list
  of proven member IDs. No synthetic cinema search steps.

### Integrity and windows

- P08 preflight `core.manifest_digest` and P05 artifact
  `native_freeze.artifact.manifest_digest` name **different objects**. Do not
  compare them as equal. Requested/effective/dataset bindings are checked.
- `source_table_digest` names original child Parquet, while `source_parts`
  names the P05-rewritten parts. Parameter digest hashes canonical parameters.
- `native_freeze.integrity` says `MATCH_AT_PREPARATION`, publishes scope/time
  and explicitly says `current_bytes_rechecked=false`.
- Keep scalar certification `NOT_APPLICABLE` and missing source wall-clock
  chronology `NOT_PUBLISHED`; no source bytes become a method certificate.
- Native Report windows are `IS`, `OOS`, `HOLDOUT`; display the source's
  state/reason per window. The qualified run did not execute Holdout:
  `FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`, not permission denied or zero.
- Native fees/funding are labelled `FULL_CHILD_TAPE`; don't rename them OOS.
- Older immutable native Report cores may omit `kind`/`execution`/selection
  metadata. Preserve typed missing fields; do not fetch from another run.

## Real source / exit gates

Optimized: `rrun_ee50cb82d6de9e495e10b32323b62f8c`, workspace
`ws_06GCVTHWC9WVPGEPR85AB15K82`. Additional fixed-native Report proof covers
Limit/OCO fixed, Bracket v4 and Reactive v3; exact IDs/revisions in the receipt.

1. Wire existing components, no new design/component replacement or baseline
   rerecord to conceal a regression.
2. Typecheck plus focused consumer tests for native/fixed/scalar, later ledger
   page selection, missing/pruned metrics, Holdout and integrity scopes.
3. On backend+web compatible bundles, browser S06/S07/S09 at1280/660:
   0 console errors, 0 unexpected request failures, coherent θ*/hashes, paging,
   Verify state and JSON/CSV prepare/download. S08 must retain approved chart.
4. Record actual image IDs/build stamps and receipt, not fixture-only PASS.
5. Update the queue/Unified with consumer SHA, outstanding typed source
   facts and visual deviations; don't claim P24/release owner acceptance.

Historical prep uses `node dist/cli/research-native-read-prepare.js
--workspace-id <workspace> --actor-id <member> --run-id <run>` on the private
Control API. This never reruns QuantBT or rewrites P05/old Report seals.
Browser GETs only read local rows. Newly completed runs use the terminal hook.

## Prompt

```text
Claude — consume §55 native S06/S07/S09 contracts on docs/research-loop-plan.
Read this packet, the linked backend receipt, latest Unified/queue addenda,
generated clients and the existing HiFi/specs. Wire native_search,
native_freeze (also Verify), and frozen_core.native_report into the already
approved components. Preserve S08, layout, theme and protocol distinctions.
Use native cursor paging; number != display ordinal; historical byte proof
!= fresh Verify; missing native Holdout/sampler/member identities remain typed.
Retake only affected consumer/browser/visual/export lanes on compatible
backend+web images. No engine rerun, manual SQL, profile opening or remote push.
Record consumer SHA, real receipts and remaining facts in Unified and §55.
```
