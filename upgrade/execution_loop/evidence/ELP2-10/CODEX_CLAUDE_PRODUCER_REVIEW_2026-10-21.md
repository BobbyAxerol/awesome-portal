# Codex producer review — Claude backend, 2026-10-21

## Current dispositions — 21 October, delegation accepted

| Item | Current disposition | Evidence boundary / action |
| --- | --- | --- |
| CR-01 Fleet lineage | **ACCEPT source**, `dd9609af` | Four cross-service tests written; exact changed-SHA execution receipt remains required, not inherited from older counts. Independent detail in `CODEX_LANDING_REVIEW_2026-10-21.md` §9. |
| CR-02 financial retry | **CHANGE**, `ec228e53` | Interleaved live failures reset mutable last-error retry state; require durable revision-scoped repair budget and actual PG interleave/restart/fence receipt. Claude owns repair. |
| CR-03 completeness | **ACCEPT source + focused**, `ec228e53` | Actual 42/42 synthetic materializer tests; duplicated independent runs are not extra coverage. Not financial runtime qualification. |
| CR-04 timestamps | **ACCEPT source + focused**, `63201e94` | Actual 123/123 independent Node20 diagnostic; final Node22 lane remains separate. |

These latest dispositions supersede the original finding status below without
deleting its history. Claude delegation `7378d423` keeps backend/FE ownership;
Codex owns only the two-file Core BUSY repair and its operational recovery,
owner coordination and conditional ff-only integration. No unrelated source edit.

Scope: approved parallel review lane 2; **SOURCE_REVIEW**, not installation,
connected acceptance, financial qualification or owner acceptance. Implementation
owner remains Claude; primary Codex integrates this return into Unified/sync.

## Pins and boundaries

- Canonical: `/home/bobby/portal-research`, `docs/research-loop-plan`,
  `7818d5631e0da37563bca5715fd46d40b66ef1de`.
- Reviewed peer: `/home/bobby/portal-research-fe`, `claude/fe-parity`,
  `fe84ee69e1bbab0eb204f8c3414a7618bf372a77` (repinned at end).
  Peer WIP: Unified, frontend/backend sync and untracked Edge priority handoff;
  no source WIP was changed by this review.
- Read root rules, campaign rules including canonical §10.13, Unified current
  entries, B1 handoff, BE-P13/P16/P17, F1–F9 closure and final hook addendum.
- Only this Markdown was written. No source changes, tests with writes,
  credentials, SSH, runtime, migration, branches, commits, merge or push.
- Source locators below are relative to the **peer checkout at the full pin
  above**, not a claim they already exist at canonical HEAD.

## Slice disposition

| Slice | Producer verdict | Reason / boundary |
| --- | --- | --- |
| B1 / FE-042 incident links | **ACCEPT source semantics** | `operational-read.repository.ts:82–106` independently scopes both operation and incident, then bounds links to 3; hidden links are neither returned nor counted. Current-only `link_history` absence is correct. No hidden-link boolean should be added. |
| B1 / FE-043 status counts | **ACCEPT source semantics** | `operational-read.service.ts:101–129`, `query/postgres.ts:475–553`: page, four facet counts and links share one repeatable-read read-only transaction and scope. Excluding a facet's own filter is explicit and tested. Queue SUCCEEDED is not financial APPLIED. Existing performance questions below remain open, not acceptance of arbitrary scale. |
| Migration 145 | **ACCEPT source** | Adds operation-leading lookup index; addresses B1's prior missing-index finding. No new fact, ownership or retention semantics. Ordinary index build needs its own operational lock/capacity consideration. |
| B2 / FE-040 | **ACCEPT source** | `deploy/images/portal-web.Dockerfile:30–39`: empty build arg keeps V1 default. The arg and B1 core implementation are already present at canonical `7818d563`; do not import/count them as wholly new work. Later fixture-BFF COPY additions stay in the build stage. |
| BE-P13 / RV-13 migration 146 | **ACCEPT source for DENIED-only F0** | New append-only attempt table cannot represent sent/retryable outcomes. Attempt+first audit are atomic; actor/workspace/key isolation and target-guarded lookup are explicit. Does not commission any command executor. Earlier `PG NOT_RUN` notes are superseded by final hook/closure receipts, not new blockers. |
| BE-P15 / RV-11 record-detail | **CHANGE narrow timestamp parsing** | Policy allowlisting, null/zero distinction and omission of unpublishable fields are sound; source timestamp parser accepts malformed/ambiguous dates. See CR-04. |
| BE-P16 financial series writer | **CHANGE before enabling writer** | Good reuse of exact-decimal aggregation, shared lease/transaction, immutable observations and typed absence; recovery and completeness gaps CR-02/03 remain. No current real financial publication proof. |
| BE-P17 Fleet realtime | **CHANGE before connected consumer acceptance** | Existing Hub/cursor/per-write authority and READ-vs-STREAM separation are reused correctly, but baseline pairs with the wrong revision representation (CR-01). Keep whole-fleet requirement; do not broaden partial-reader STREAM. |

B1 core files (`operational-read.repository/service`, `query/postgres`) have no
diff between canonical `7818d563` and this peer pin. B1 index and broader backend
are reviewed separately; no blanket acceptance of every backend file in the
peer branch is implied.

## Changes requested — exact issue and minimum gate

### CR-01 — Fleet snapshot cannot pair with the actual named Fleet read (high)

- Producer `apps/control-api/src/execution-v2/alpha-fleet-realtime.service.ts:129–135`
  sets `named_snapshot.lineage_revision = head.revision` (raw stored revision).
- Real named reader `manager-model.ts:386–387` returns
  `lineage.revision = accessDigest({ scope: scope.fingerprint, source: doc.revision })`.
- FE `apps/portal/frontend/src/execution/v2/readers/alphaFleetRealtime.ts:223–228`
  compares those strings exactly. Therefore two reads of the same source revision
  produce `STALE_BASELINE`, not `PAIRED`. Synthetic double pairs deliberately
  matching strings, so its PASS does not cover the real mismatch.
- **Change:** publish the exact public lineage identity of the named Fleet read,
  without replacing its scope binding with a global raw revision. Account for
  the root business scope used for STREAM vs the `alpha.read` scope used by
  `/manager/fleet`. Revise the current contract rule equating named lineage and
  raw baseline if needed; regenerate schema/types/fixtures and tell Claude.
- **Focused gate:** same source document + same actor/environment/workspace via
  both real services must pair; actor/grant/resource changes must not pair;
  head change between reads must remain stale; READ alone must not enable STREAM.
  Existing pure realtime and scope tests remain regression inputs. This requires
  one cross-service test, not another full-suite run for the review itself.

### CR-02 — Series backfill stays COMPLETE after a later live-write refusal (high)

- `manager-series.store.ts:128–130` returns `NO_WORK` permanently when the
  checkpoint is COMPLETE.
- `manager-series-runtime.ts:77–87` explicitly allows financial revision commit
  after the optional series write fails. `recordFailure` at
  `manager-series.store.ts:79–83` records the error but does not reopen/schedule
  missing-revision repair.
- Thus, after initial backfill finishes, one transient live series failure can
  leave a retained revision without observations forever, including after restart.
  Existing PG test `be-p16-manager-series-pg.spec.ts:178–193` checks terminal
  cheapness only; it does not introduce a later missing live revision.
- **Change:** bounded recovery must revisit later missing observations after a
  refusal. Preserve original source ACK/financial commit, immutable rows and
  lease fencing. Do not solve by repeated full-history scans per browser.
- Also handle the non-throwing `DIGEST_MISMATCH` result from `recordRevision`
  (`store.ts:44–46`): live persistence currently ignores it; backfill advances
  its cursor (`store.ts:175–179`) without a refusal record. Record the mismatch
  explicitly, never overwrite or treat it as a successful compatible replay.
- **Focused gate:** finish initial backfill → force one live series insert
  failure while financial revision commits → remove fault → bounded idle repair
  → restart holder → exactly one immutable observation set; digest mismatch
  stays unchanged and produces an explicit error disposition.

### CR-03 — A revision marker can falsely prove complete financial history (high)

- `manager-series-materializer.ts:134–154` considers history old enough when
  **any revision marker** reaches the window start.
- Missing/null observations produce a gap only between two valued points
  (`:110–131`). If early revisions have no usable NAV/NET_PNL and only the latest
  revision has a value, the unbroken marker chain + one current point can emit
  `quality.completeness: COMPLETE`, with no gap or reason for the missing prefix.
  Marker-only history is not proof that this subject/metric was observed.
- **Change:** completeness must consider each series' usable observations and
  absences across the requested window, including leading missing history. State
  PARTIAL/typed absence as appropriate; no interpolation/carry-forward or invented
  boundary point. Keep the valid distinction between sparse observed history
  and missing observations; no assumption of daily cadence is requested.
- **Focused gate:** marker before window + early null/missing/methodology-refused
  observations + single valid current point cannot be COMPLETE; analogous
  population/methodology changes remain disclosed. Keep existing continuous,
  fully observed sparse history case and inside-window gap cases passing.

### CR-04 — Record-detail timestamp parser invents an instant for malformed input (medium)

- `record-detail.ts:27–32` uses unrestricted `Date.parse`; its stated contract
  is an ISO instant or integer stamp, malformed source cells omitted.
- Read-only Node diagnostic actually run in this review:
  `2026-02-30T12:00:00Z` becomes `2026-03-02T12:00:00.000Z`; `1` becomes
  `2001-01-01T00:00:00.000Z`; zone-less date/time is also accepted. Thus an invalid
  or ambiguous source time can be shown as a real UTC event time.
- **Change:** require the source's documented explicit-zone ISO instant grammar
  plus valid calendar fields (or already-safe integer epoch-ms). Preserve the
  approved sub-ms truncation; reject ambiguous/local dates rather than guessing.
- **Focused gate:** extend `be-p15-record-detail.spec.ts` with invalid day/leap
  day, date-only, numeric string, missing zone, valid `Z`/allowed offset and
  fractional-second cases; malformed values remain absent with the existing
  reason path. No frontend layout change is needed.

## Existing risks retained, not misclassified as new implementation requests

1. **NET_PNL ownership:** BE-P16 already flags that `economicFacts`
   (`manager-model.ts:108–120`) deduplicates NAV/balance snapshots but not PnL.
   New series reuses that behavior. No qualification of consolidated NET_PNL
   until source fact grain proves no shared-account duplication or a reviewed
   ownership-aware rule exists; do not unilaterally dedupe all PnL facts, because
   legitimate distinct contributions can share an account.
2. **B1 cost:** four group-count queries remain always-on with per-statement,
   not total request, timeout. B1 handoff §12 M2/m4 and full-query large-scale
   EXPLAIN gate remain explicitly open. Do not silently turn counts into zero or
   remove supported UI facets. No new opt-in/API change is approved by this review.
3. **Fleet deployment bounds/revoke:** BE-P17 documents per-process caps, optional
   fast revoke hint not wired and source notice `NOT_COMMISSIONED`. Granting
   STREAM is a separate exact authority action; source fixture budgets are not
   production/calibration approval. Core009 native READ/STREAM qualification is
   not automatically the same dataset as Fleet notice qualification.
4. **Financial slot stays opt-in:** fixes to BE-P16/17 must not delay the already
   approved, independently prepared Core009 native composition when these
   optional series/Fleet additions are not part of that installed candidate.

## Test provenance and resource disposition

- Reused as **reported prior evidence**, not a new run: B1 handoff final PG
  76 + snapshot-reader 9 = 85 PASS, no skips; final Claude hook `a896bd08` on
  source `9d15755f`: contracts 90 files / 1,577 PASS, API 472 files / 9,445 PASS,
  3 skips and 2 skipped files; restore and route census reported PASS.
- Final hook addendum supersedes earlier BE-P13/P16/P17 `PG NOT_RUN` paragraphs.
  It includes the relevant source commits (`34e550ee`, `02a3b75c`, `1efd0329`,
  `33abd856`), but does not prove the new cross-service/repair cases above.
- Actual this round: read-only Git/source/doc checks and the four-input Node
  timestamp diagnostic. **No test suite, Docker, DB, build, HTTP or browser run.**
- Claude latest `fe84ee69` adds V2 pixel baselines. That is not itself a terminal
  R2 visual acceptance receipt. Do not re-open pager/timestamp/title UI work
  already superseded by `a13b4fa6`, `5bc040f6`, `97454777`.
- Cleanup: **NO_ACTION_NEEDED**. No temporary service, cell, credential, output
  artifact or resource reservation created; only this requested review file.

## Handoff

Claude can fix CR-01–04 on the existing backend ownership lane, one writer per
file; keep UI design intact and amend consumer fixtures only for the necessary
revision-identity contract change. Primary Codex owns official sync/Unified
disposition, scheduling the focused gates and integration. This file is a
review return, **not** proof Claude has received/ACKed it.

Useful parallel order: CR-01 (blocks connected Fleet pairing), CR-02/03
(financial writer correctness), CR-04 (source-clock hardening). Core009 native
installation/owner-window coordination proceeds independently. ELP2-10 full
exit remains NOT_MET; no ELP2-11, main/dev, release or trading activation.

## Incremental independent acceptance,21October around05:00UTC

Claude ACK and new source reviewed separately from the originalfe84ee69 cut.
**CR-01/02/03 remain CHANGES_REQUESTED.** Original findings/evidence above are
preserved; the following supersedes CR-04's pending implementation only.

- **CR-04 ACCEPT source/focused regression** at
  `63201e94bf8b63ddc3924f16b992b01d19124439`: explicit ISO zone/calendar/leap
  validation, offset handling, integer epochs and approved fractional truncation.
  Malformed inputs remain omitted with original reason; common readers reuse
  the parser. Independent existing `be-p15-record-detail.spec.ts`:123/123PASS,
  exit0,19.28s,1worker/384MiB heap/60s timeout, no DB/Docker/network/build.
  HostNode20.20.2 diagnostic, NOT replacement for Node22 final image gate.
  Same123 cases as Claude's run: do not add them as new coverage.
- **Diagnostic carry ACCEPT** at
  `1328d1b7718b384779eb7a24bc3ceeb800694d85`: three diagnostic paths and original
  Core receipt exactly match73435311; peer access/session additions preserved.
  Commit records112 focused tests PASS; no new rerun of those tests here.
- **Packaged SQL permission fix ACCEPT source** at
  `6da309dff3e06153d79f88095bf272581ddb41ab`: only non-secret SQL/migrations/
  package become root-owned0644/directories0755; private bootstrap COPY and
  final USERnode unchanged. SQL bytes remain826e4e08. This fixes the root
  cap-dropALL read issue for a FUTURE image, not today's unchanged9cf5fffa.
- `9810f8eff9393c1ef0bd51cfc6300f5da1d8cfc4` adds the permission check to hook;
  EDS-12 updates actual subject-activity source hash, runtime_effectNONE.
  Independent cheap image-permission and D2/D3 publication static gates PASS
  (38ms/177ms). No image build/installation/automatic landing claimed.

Only these public review updates written; no peer source, runtime, shared index
or acceptance baseline changed. Normal focused test process exited; no retained
test server/container/resource to clean. Core009 connected qualification remains
on the previously installed73435311 image, not any of these later peer commits.

### ec228e53 follow-up

`ec228e53b9cf97b5e732024954d131e057d3f778`: **CR03 ACCEPT source+synthetic**.
Actual independent42/42materializer cases PASS (Node20,1worker,384MiB,20.92s);
another reviewer inadvertently ran the same42cases17.22s: corroboration only,
NOT84newcoverage. No PG/Docker/build. PGhistory-query execution still needs its
own gate; no writer/runtime activation from source acceptance.

**CR02 CHANGE remains:** store89–95 overwrites `last_error_code/revision` for
newer live failures; repairAttempt190–194 derives its counter solely there.
repair(r0)→RETRY_1, livefailure(r1)→diagnosticr1, repair(r0)→RETRY_1 resets the
bound repeatedly. This can starve all later holes. Require durable revision-
scoped attempt state, independent of mutable last-error diagnostics, plus PG
interleave/restart/third-attempt progress with lease fencing. Existing sequential
PG248–262 case is insufficient. Primary confirmed source and delivered the
narrow correction to Claude's existing handoff. CR01 remains open.

### 21 October06:38 UTC — C5 PM source rules independently checked

This adds to, not replaces, the later CR01 source acceptance in Unified/sync.
PM owner-return `pma11-13-14-16-portal-owner-intake.json` at
`c0095d120e855a17ba53e2523231b4d6566164fa`, SHA256
`3e29f0395e3b07f885baecf3a0c0057367d3111359de34382af37fe904c8c407`:
**ACCEPT_SOURCE_RULES**, not financial-wire/runtime qualification.

Independent reviewer and primary checked `operator_reports_contract.py:174–203`:
same source ID requires whole-row equality, conflicts/overlapping economic leaves
refuse; missing expected source census or valuation proof nulls **all** aggregate
economics with PARTIAL. `:219–241` filters using current authority before grouping;
historical owner is not a present read grant. PM compatibility fills/funding do
not establish arbitrary-window cost completeness.

Claude7378d423 `manager-model.contract.ts:58–64` does not publish that proof;
`manager-model.ts:69,98,110–118` has fact-ID/snapshot handling, not the required
NET_PNL source-set mapping. Do not fix by equal-amount dedupe or treating all
same-account rows as duplicates: disjoint logical sources may sum legitimately.
PM/Edge selected producer must supply versioned source_id/leaves/census/cut and
ownership/valuation/window mapping; reader and series share the validated reducer.
Full actual owner answer: [C5 return](PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md).
No source edits/tests/runtime changed; new handoff delivered in Claude checkout.

### 21 October07:07 UTC — actual R2 failure review, no waiver

At unchanged Claude7378d423, independent reviewer and primary checked three
fixture/diagnostic changes for Claude-owned tests. Actual R2 remains exit1,
9530PASS/3FAIL/3SKIP; this review runs no tests and establishes no replacement PASS.

- Native fixture: derive native120s and installation110s expiries from one
  captured clock, not clocks separated by awaited TLS setup. Keep product
  configuration refusal unchanged (`current-human-candidate.ts:786`).
- `profile-projection.spec.ts:225–249`: zero full reads passed, count804 fails
  required>1000 before fan-out and metrics. Record per-scope terminal/activity,
  query/event-loop diagnostics even on failure; await shutdown drain before
  restoring mocks. `profile-realtime.service.ts:407,553` can coalesce or terminate
  scopes; the existing aggregate/log cannot distinguish the cause. Keep bounds.
- `elp207-pending-control-transaction.spec.ts:347–360`: race deferred rendezvous
  against producer failure/settlement; surface failure phase and always release/
  join held promises. Existing swallowed rejection may hide a pre-latch error.
  Keep actual10s, cap4, UNKNOWN and no-second-APPLY; do not merely increase30s.

Status **CHANGE_TEST_DIAGNOSTICS / AWAITING_CLAUDE**. No assertion weakening,
production edit or causal claim that all failures are harmless contention.
Exact handoff delivered in Claude's `CODEX_RETURN_CORE009_REVIEW_2026-10-21.md`.
