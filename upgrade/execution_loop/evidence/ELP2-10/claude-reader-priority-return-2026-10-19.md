# C7 — Claude reader priority return, 2026-10-19

## Scope and pins

Producer: `docs/research-loop-plan`, entry
`f46439157fe25892fc4372dda532bd1f8bdc4773`, plus this coherent owned batch.
Verification tier **R3**, ordinary hook required, no bypass. This is local
producer/contract delivery, **not** provider/runtime or browser acceptance.
Peer read: clean `claude/fe-parity`
`21af67923e0a03751d54a124883da6a5c828b005`; official request/sync ledger has
no new approved backend request since the preceding cut. FE-066…072 remain
draft. No peer/FE files, runtime, migration, credential or protected data changed.

## Delivered shapes and remaining boundaries

| Request | Producer and generated contract | Behavior / canonical example | Still open |
| --- | --- | --- | --- |
| FE-044 | `manager-lists/{contracts,manager-lists.service}.ts`; `execution-manager-lists.d.ts` portfolio query and `execution-portfolio-list.v1.schema.json` | `q` is bounded literal case-insensitive **name** search, authorized before match/count/page. Scoped pagination binds exact query/env. Legacy example: `total_portfolios:250, matching_portfolios:1, truncated:true`; retained match count is not global total. | Legacy paging still refuses rather than ignoring it. Environment-partitioned financial publication is not supplied by this change. |
| FE-033 | `manager-model{,.contract}.ts`; generated `ManagerDatasetQuery` | `filters:[{field:"health",op:"IN",values:["HEALTHY","DEGRADED"]}]`; 1–32 distinct text members; exclusive `value`/`values`; exact decimal validation/comparison for financial fields. Canonical `execution-manager-query-in.synthetic.valid.json`. | Aligned comparison series/source financial proof is separate; IN is not delivery of the entire Compare request. |
| FE-045 | `governance/{contracts,governance.repository,governance.service}.ts`; generated `ApprovalInboxItem` | Required nullable `portfolio_id`; only direct immutable R2 scope / captured Paper Exit review of the authorized workspace/page/gate. Example fixture has `portfolio_id:null`. No R1→future-R2 inference or parsing subject labels. One bounded query, post-await authority fences preserved. | Navigation metadata only, not permission to read the portfolio or a new portfolio-count/filter contract. Missing/unsupported/ambiguous lineage stays null. |
| FE-046 / FE-032 | `portfolio360-local.service.ts`, `analytics.controller.ts`; generated `LocalCapitalLedgerData`, `LocalCapitalLedgerEntry` | `limit` 1–250 and signed `next_cursor`; canonical `execution-capital-ledger-page.synthetic.valid.json`. Exact currency totals are `AUTHORIZED_VALIDATED_SOURCE_CHUNK`; max eight 200-row source pages per request, continuation reaches subsequent chunks. Cursor binds actor/session/version/workspace/env/portfolio/head/limit; changed chunk409, tampering400, revoke current-first. | Current source does not publish literal `seq`/`command_id`/`receipt_ref`: null, never synthesized. Ordering/consistency is within the disclosed source chunk, **not** whole-history snapshot/global ordering. Capital-flow edges/bases remain their separate source obligations. |
| FE-052 | `paper-read/{contracts,paper-read.service}.ts`, `product-read-source.ts`; generated `PaperData` and Blotter query | Server stage/deployment/account/alpha filters before page; explicit qualified alpha↔strategy membership, never string equality. Four nullable filter echoes and complete eight-key allowlist. Paper route rejects other stages with `N22_BLOTTER_STAGE_NOT_AVAILABLE`. Updated canonical full-Blotter fixture. | New filters do not create unpublished order price/fee/slippage/bracket fields. SCOPED_V2 omits incompatible legacy mirror proof/counts; exact-query remains `PARTIAL/SOURCE_PARTIAL`, null authority/formula/counts, not fabricated TS exactness. |

The capital ledger also rejects conflicting ledger identities and source cursor
cycles; exact duplicate identities count once with `duplicate_row_count`.
`command_id` / `receipt_ref` accept only literal nonempty strings ≤256,
otherwise null: no stringification/truncation. Continuation keys are the
existing bounded public source cursor, not a raw DB/SQL/URL capability.

## Actual validation and retained failures

1. Isolated Node22/PostgreSQL nine-file focused batch: **293 PASS / 1 FAIL**,
   294 tests, 74.81s; TypeScript build PASS. The failure was the genuine
   source→Manager parser→Paper adapter test, not hidden by a looser mock.
   Log `claude-reader-batch-focused.log`, SHA256
   `091d1f7921a6114b3606343e91481ccc223189102957a10f99d5c4a99f44c6a1`
   in the dated private commissioning directory. Its fixture published `OPEN`,
   an order **bucket**, which the canonical status mapper correctly quarantines.
2. Test-only repair supplies canonical `ACCEPTED` and the already-reviewed
   `RISK_REJECTED` mapping, plus negative quarantine guards for `OPEN` and an
   unknown status. Actual local Node20 focused Blotter **38/38 PASS**, 12.11s
   wall /475ms test time. Test SHA256
   `e91f94eb426982a3cb3366f6772670bd0f5a004048edf293e51ac33b4b76f610`.
   No runtime status vocabulary/authority guard was weakened.
3. Independent ledger review caught a `sha256:` decoder mismatch, duplicate-ID
   expansion, contextual-error ordering, unbounded provenance and undeclared
   duplicate count; all corrected before landing. Actual local ledger **8/8
   PASS**, 11.80s wall, including 1850-row traversal beyond one 1600-row chunk,
   256/257/non-string provenance, exact money, cursor isolation and revocation.
4. Generated IN schema initially failed strict Ajv compilation, then exposed
   old P1 scalar-only refinement. Both generator defects were corrected, strict
   validation retained. Actual Manager/scoped/reader contracts **63/63 PASS**;
   after the final Blotter fixture/tuple check, reader contracts **4/4 PASS**.
   These overlap; do not add them as independent coverage or runtime evidence.
5. Earlier self/auth/decimal failures and their exact focused repair receipts
   remain in [the round journal](c7-priority-round-2026-10-19.md) and
   [test result record](self-access-test-results-2026-10-19.json).
   The prior ordinary R3 retry was controlled-cancelled before API tests, not
   PASS. Final landing runs the **unfiltered ordinary hook**; its terminal log
   and resulting Git commit are the authority for that gate, not this focused
   test packet. No duplicate engine/load/DR/build commissioned for docs.
6. First reader-batch ordinary R3 exited1 in contracts: **1145 PASS /2 FAIL**,
   56.63s, before full API tests. Canonical standalone Paper JSON Schema had
   not yet received the four query axes/eight-key tuple already in OpenAPI.
   Synced that schema and added explicit standalone↔OpenAPI/fixture conformance;
   no validator relaxation. Failed log `claude-reader-normal-hook-1458.log`,
   SHA256 `e9734d9726a5edee4aad3eb897978c053c4028a60ca0a56baefd7d934aba0f9a`.
   Final local fixture/reader/Manager focused **176/176 PASS**,7.59s, after the
   repair. Normal landing must pass; the failed run is not full PASS.
7. Independent runtime/contract review found the BFF emitted nine allowlist
   entries while canonical/OpenAPI required eight. Controlled-stop of1504R3
   after contracts **1147PASS**, during API compilation and before its tests:
   **CANCELLED**, not PASS. Exact Node1909076 stopped; trap removed PG/network.
   Log SHA256 `c18590cbf13b4b8dea442065f2d363007867ce27dffaef330c7182376e7e909d`.
   Producer now emits the exact published tuple/order. Existing status_bucket
   query/filter/echo behavior is unchanged; actual BFF query conformance is
   tested separately from fixture parity. Final ordinary R3 remains required.
   Actual final host-only Blotter focused **42/42PASS**,22.41s wall/1.22s test;
   strict Ajv against actual native/legacy service queries, negative ninth/
   reordered tuple, and retained OPEN/FILLED bucket filtering/echo. Source SHA256
   `0828caf9b388b9f744d61c10ca760f9a26c518da0cadbb727e17c0dca8dcf3b8`.

## Claude next: consumer checklist

Read this batch from the eventual producer commit, regenerate from canonical
outputs after rebase; do not hand-merge generated files or change UI design.
No automatic merge is performed while R2 evidence/compatible base is missing.

1. **P0 self-access**: `accessSelf.ts` interfaces and closed root allowlists
   at190/228/347/409 must accept `observed_at_ms` / `valid_until_ms` from the
   existing canonical fixture, safe integers/end-exclusive. They are own-session
   advisory ceilings, not permission expiry or a cached grant. Preserve current
   authorization on each operation and selected-env semantics.
2. **Portfolio**: API ports/http adapter accept `q`/env/cursor; use the existing
   scoped DTO reader for SCOPED_V2 and consume optional legacy
   `matching_portfolios` with retained/truncated disclosure.
3. **Inbox**: `cockpit/inboxRowV2.ts` retain nullable `portfolio_id` for navigation;
   no label parsing or inferred rights; null is meaningful, not a missing test.
4. **Ledger**: analytics reader/http adapter consume `next_cursor`, page limit,
   returned count, totals scope, ordering and three nullable provenance fields.
   Do not add chunk totals across repeated continuation pages or label them
   whole-history totals. Preserve absent source IDs as absent.
5. **Blotter**: API ports/model send four scope axes; request/URL/reload/cursor
   stay consistent. Query echoes are required; SOURCE_PARTIAL and quarantine
   are not empty/exact-zero data. No SANDBOX/Live fallback through Paper route.
6. **Compare**: use typed IN `values` when appropriate; keep aligned-series and
   financial availability gates. **Operator config-plan copy** remains plan-only,
   not “Plans and applies”; no route/admission change is requested.

Consumer receipt must load canonical fixtures, assert fields consumed and
intentional absences, test denied/revoke/query-change/cursor boundary, then
browser on the assigned qualified source. Fixture PASS is not connected PASS.

## Source commissioning, remaining owners and rollback

At14:57UTC read-only HK: Edge
`6adc398b573e297b731863e5ed93f0f7f59ab2fd`; PM
`bc0946f4abdb545e7f311c58f3f2cb1d640d8761`, docs-only change, identity
closure0/10 changed; Edge helper/operator/test hashes unchanged.
Edge accepted installed Core manifest `15d94c6f…` **as input**. Official Edge
Unified23327–23335 and PM§58.203.2 at81327 still require owner operator
qualification, operational manifest/config ACK, finite window and authenticated
recovery28446 READY **before** genuine Core30s assertion. Current process state
not probed. No JIT/session issued, no COMMIT/CoreACK/READ/SSE claimed.
Read-only cut15:10UTC: PM `805afd933a599884af61228fbf944e73a851c778`
docs-only§58.205.2 at81394 retains these prerequisites; Edge/operator pins
unchanged. Peer `eda9b52a852ea7e781ac296f3ea04854e1ef63b5` FE-only, no official
backend-request delta in that peer; two EventFeed/test WIP paths preserved.
Subsequent Edge→Core request008/009 appeared in this checkout: unused-identity
finish and native READ composition. [New owning request](EDGE_TO_CORE_EPG10_08_REQUEST_2026-10-19.md)
requires separate Core review/return. Earlier installation is preserved as
history, not proof that this newly identified repair is already installed.
Use [the already delivered installed bundle](CORE_INSTALLED_EDGE_HANDOFF_2026-10-19.md),
not a new build/install/schema/cookie request. UNKNOWN retains custody; no
forced rollback, blind reissue or loss of existing audit/commit obligations.

After that return: exact identity COMMIT/CoreACK → current-human Paper READ/
STREAM with revoke/restart/recovery → genuine financial selection/traces → one
numeric engineering budget/calibration proposal → matched coexistence/P184G2
→ Claude source/browser. Existing 2CPU/1536MiB/300s is confinement, not a
production SLO/calibration artifact. Formula is locked; calibration is not.
No command/Live, dev/main/stable/push/release authorized by these local reads.

Rollback this local batch by reviewed forward repair/revert of its own code
and regenerated contracts; never restore/revoke another person's grants,
overwrite peer work or delete custody/evidence/source/business rows. Source
installation/backup/private return is unchanged. Focused cell teardown follows
its exact script trap; final hook teardown/capacity goes in the private terminal
receipt. Reused3 agents/new0, one heavy job at a time. Whole **10 NOT_MET**;
**11 NOT_ENTRY_READY**. Backend may continue commissioning gates within10;
no separate phase is entered and Claude acceptance remains independently owned.

## Normal-hook terminal16:12UTC / scoped-test repair

Actual normal R3 exited1, not committed: contracts1147PASS; API8448PASS/1FAIL/
3SKIP,426files:423PASS/1FAIL/2SKIP,2527.56s. Failure at
`test/elp204-explicit-resource-read.spec.ts:272` expected global exact mirror
metadata on SCOPED_V2; source intentionally refuses that proof and serves
PARTIAL. Test corrected to traverse both bounded authorized pages and assert
actual two-row population, PARTIAL/nullas_of, absent legacy metadata/counts/
aggregates, peer/Cartesian/hidden-filter exclusions and limit-bound cursor.
No source guard or gate threshold weakened. Test SHA256
`d60efa071c4a7347917034cc0f4b06a59edf21b222428c3a0ec718f9b704d271`.
Failed private log `claude-reader-normal-hook-final.log`, SHA256
`be696c9715d49bb52a745a98e903234f6a8e92d237c9c821659f21520ed8d463`.
Exact old test PG/Node/network removed by trap and absence checked. Prior
receipt is retained, not rewritten green. Focused test retake is part of
[008/009 source-only return](CORE_EDGE_REQUEST_008_009_RETURN_2026-10-19.md);
normal R3 remains required at actual commit, no bypass. Source-only handoff
per owning request permits exact uncommitted source/diff hashes; it does not
claim full batch landed or ask for another broad run solely for documentation.
