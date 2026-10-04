# P24 / §32 — Codex review and bounded backend repair

Base: `3fdd3349`, including all six Claude commits after `0df6030f`.
Backend lane: `codex/be-gaps`; landing branch: `docs/research-loop-plan`.
No frontend redesign, remote push, dev/main promotion or production deployment.

## Work order and acceptance

1. Review Claude's matrix, reconciliation and journey receipts against their
   scripts/code. Keep fixture, real API, flaky mobile and owner review distinct.
2. Name Compare's preflight-manifest scope and expose the retained source
   manifest separately; retain the old field for existing clients.
3. Separate current-source fact revision from HTTP/presentation revision;
   preserve existing sealed Report/RC bytes and their historical revision pins.
4. Make an unpublished publication's update timestamp stable/absent, not now.
5. Publish final-audit applicability from typed target facts, not claim prose.
6. Diagnose imported fixed-profile admission against its existing v1 contract
   and preview flags; exercise only the existing supported profile. No implicit
   optimizer widening, sandbox bypass or production activation.
7. Check legacy export compatibility and publisher approval-read authorization.
8. Record Portal **v2.0.0** as the next release target independently of pinned
   QuantBT **1.1.1**. A Portal version change does not require a second engine.

Focused schema/service/fixture tests cover affected reads and negative paths.
Use the existing isolated P23 cell for affected real-API evidence if needed;
do not restart Claude's :8095 preview. Run the mandatory commit hook once for
the coherent repair, rather than manually duplicating the full suites.

## Review facts already checked

- All six Claude commits are ancestors of the shared Research branch. The
  backend lane was fast-forwarded to the same source before editing.
- The 182/18/75 reconciliation tally is present in its machine receipt. The
  18 failures are not all defects: historical immutable pins can legitimately
  differ from current reads. A transient sparkline 503 and volatile publication
  timestamp still require separate investigation.
- `Compare.provenance.manifest_digest` currently names the producer's preflight
  manifest, not the retained artifact manifest. Changing its value silently
  would break its existing meaning; publish a distinctly named source field.
- Split/search/freeze representation revision includes a presentation marker.
  A shared hash suffix across split/replay is not an identity collision: the
  full revision includes the view kind and both can bind the same retained seal.
- Imported execution already exists as `p17.imported-signal-notional.v1`:
  three-window, `signal_notional`, one trial, declared parameter pins, no
  optimizer config. A WFO or optimizer-shaped request is not that profile.
- Full lane remains **227/228**, not 228/228; S06 isolated 3/3 does not erase
  its full-load flake. The 21 outstanding §16.6 scenarios remain unexecuted.

Implementation/test results and per-request disposition are appended below.

## Implementation and disposition

| §32 | Result | Contract / boundary |
|---|---|---|
| 1 | DELIVERED: Compare keeps its preflight manifest and exposes the retained manifest separately | `CompareResponse` → run `provenance.manifest_digest_scope = PREFLIGHT_DATASET_SPEC`, `source_manifest_digest: string \| null`; null if not sealed. Never substitute a dataset/spec digest for an artifact digest. |
| 2 | DELIVERED: source and representation revisions are distinguished | Current-source reads add `source_revision` (immutable seal facts) and `presentation_revision` (live representation). Existing `revision`, cursor binding and ETag behaviour remain intact. Report adds `source_revision_scope = CAPTURED_READ_REPRESENTATION`; historical `frozen_core.source_revisions` remain unchanged. |
| 3 | DELIVERED: no-intent publication timestamp is null | `ReleaseCandidatePublication.updated_at_utc_ms` is nullable. A persisted intent still supplies its persisted timestamp; `as_of_utc_ms` remains the observation clock. |
| 4 | REAL_API_BACKEND_ACCEPTED on owned :8096 | Existing `p17.imported-signal-notional.v1`, DRAFT import and pinned fixed execution work. No admission widening, engine change, source-store write or activation on shared :8095. Product browser journey on the final merged bundle is a separate receipt. |
| 5 | DELIVERED: explicit applicability on Report/RC | `ReportDetail` and `ComposeResponse`/`ComposeResponseP21` add `final_audit_applicable: boolean \| null`. It derives only from the typed audit target: single parameter set → true; fixed/per-fold target → false; unpublished → null. It is NOT permission or `may_create`. |
| 6 | CONFIRMED_LEGACY_CONVENTION, no backend rewrite | Legacy export uses FastAPI `detail` errors; named v1 uses Problem. Prepare→download remains mandatory. A 404 before prepare is not authorization to start export on GET. |
| 7 | OPEN_PORTAL_ENGINE_TRANSITION, not an engine execution defect | Bare-wheel 1.1.0→1.1.1 proof exists, but no Portal 1.1.0 binding/transition receipt exists. This patch does not weaken the pinned 1.1.1 admission/gateway/supervisor or call T07/T13/T05 PASS. |
| 8 | CONFIRMED_AUTHORITY, no RBAC widening | Publishing reconciles only the publisher's immutable R1 pin. Full mirror is independently gated by R1 read permission (`GovernanceService.detail/assertGovernance`). Correct DENIED copy stays; publication itself does not grant review rights. |

### Version decision, Bobby 2026-10-04

- Current deployed Portal stable: **v1.1.1**, without this Research campaign.
- Next Portal release target: **v2.0.0**, including Research Loop V1.1.
- Installed Research engine: **QuantBT 1.1.1**, independent of the Portal's
  semantic version. Retain this pin for this repair/current candidate.
- An engine-1.1.0 Portal bridge is additional adapter/runtime work for the
  explicit engine-upgrade experiment, not a prerequisite imposed by the name
  Portal v2.0.0. Preserve its open gate until the experiment or owner disposition;
  do not reclassify missing transition proof as PASS.
- No main merge, production release, tag or remote push is performed here.

## Real imported-profile receipt

Run **`rrun_1a6f4a85f2f43a659ac9727607acb6bf`**, BTCUSDT,
`crypto-binance-1m` resampled to 1h, read-only historical data:

- IS `[2026-06-01, 2026-06-08)`, OOS `[2026-06-08, 2026-06-15)`,
  holdout `[2026-06-15, 2026-06-17)`; all UTC.
- Imported DRAFT, `three_window_decay`, `signal_notional`, seed 42, one trial,
  `early_stopping: null`, empty optimization/route config, declared `scale`
  range pinned to 1000. Imported function returns
  `research.imported-signal-notional-output.v1` and a finite `signal_notional`;
  returning the entire input context is not this installed output contract.
- Missing-pin preflight correctly returns `may_create_run: false` with
  `run_admission.field_path: ["parameter_space_overrides"]`. After the pin,
  preflight admits; create returns 202; the confined child completes and
  retained materialization finishes. Evidence/Split/Search/Freeze/Replay/
  Report/RC all return 200. Fixed-profile lane disclosures stay typed N/A;
  this is not a WFO source-revision receipt.
- Report and RC explicitly return `final_audit_applicable: false`. Report
  returns `source_revision_scope: CAPTURED_READ_REPRESENTATION`; RC remains
  not sealable while its alpha is DRAFT. Execution is not publication approval.
- Full private DTO evidence:
  `/home/bobby/.local/state/portal-research-p23/20261003/nonreuse-r020/section32-imported-profile-p23-reader-94.json`,
  SHA-256 `27560bf6c448cadcb9faad47ab54a9c8e164ad10e07f5b7e07b591bf41982f43`.
- Control image:
  `sha256:ccbec71c9ca1192596a329fefdb873cda4037888e7eb6f3ce7f0ddf9bed94e45`;
  private Python/worker image:
  `sha256:7d68b990005ef504176128c83513fce7103c31b8db725979cfc30dcc75ac9700`.
  Control build context is the backend worktree; compiled new fields/helper
  were verified in the image before the run. It is a dirty repair candidate,
  not a signed or clean release image. Worker AppArmor `portal-research-child`.
- Identity/QA evidence:
  `section32-image-and-teardown.json`, SHA-256
  `9ce05b00bb91b5e69c5e68fe639ce7f945d3070b9e4cbce9f82981513ff3137c`.
  QA `p23-reader-93` (setup failure only) and `p23-reader-94` (successful
  run) are DISABLED with **0 active sessions**. No existing identity was reset.
- Setup failure is retained: the initial harness omitted the second login
  after password change, which intentionally revokes the activation session.
  This was a receipt harness error, not a product auth defect; no job ran then.
  The first gateway image index was no longer resolvable despite its running
  shared container; reused an available owned gateway without restarting it.
  No browser/UI acceptance is claimed from this backend-only gateway.
- The cloned historical queued fixture had no dispatched worker attempt;
  it was preserved and never submitted/retried. Owned cell containers/network
  are now **0**. All source bytes, volumes, backup and receipts retained.

## Tests and review scope

- Focused affected backend/contract/fixture executions: **98 + 28 = 126 PASS**.
  Compare's suite appears in both batches (fixture regeneration); this is not
  a claim of 126 distinct tests. Mandatory coherent commit gate recorded below.
- Generators reran for Compare, current-source, publication and linked audit
  (Report/RC), updating OpenAPI and generated declarations with no FE edits.
- Claude's receipts retain their own candidate/image scope: 613/0/69 screen
  cells, 227/228 lane gate, 5,918 unit passes. We did not rerun unaffected visual
  or optimizer suites merely to review their receipts.
- The reconciliation's 18 FAIL is not equivalent to 18 backend defects:
  immutable historical fingerprints and archived representation pins can differ
  from current reads. Compare manifest scope and publication time were repaired.
  The initial sparkline receipt lacked a refusal body; the focused diagnosis
  below now proves a separate query-timeout problem. Do not relabel it as
  expected old-seal drift or silently pass it.

## Claude handoff — generated reads, no redesign

1. Compare uses `source_manifest_digest` for retained artifact identity.
   Label the preserved `manifest_digest` as preflight dataset/spec; don't compare
   it to Report/RC artifact digest. Null remains absence, not a fallback digest.
2. Live views distinguish `source_revision` from `presentation_revision`.
   Archived Report pins were captured read representations; do not compare
   their old values unconditionally to today's presentation/cursor revisions.
   Split and replay sharing the retained seal hash suffix is expected; their
   complete kind-qualified IDs are distinct.
3. Null publication `updated_at_utc_ms` renders no intent timestamp; `as_of`
   must not masquerade as publication time.
4. `LinkedAuditConsumer.auditApplies` currently treats null as applicable.
   Use `final_audit_applicable === true` before probing. False/null must not
   issue that request. True still requires the audit GET's server `may_create`;
   it does not enable a POST or confer permission on mount.
5. Use the exact admitted imported request above for S14→S02. Static 7 import
   gates and 15 preflight gates do not override `may_create_run`; show its typed
   admission field/reason. Do not use 12 trials/early stopping or missing pins
   to test the installed fixed imported lane. Arbitrary scratch remains typed
   unsupported, not a promised executor.
6. After those bindings, retake the affected reconciliation checks and the
   import browser journey on the final single candidate. Keep S06 full-load
   flake and the **21 unrun §16.6 scenarios** open until measured. None of
   this receipt upgrades READY_FOR_BOBBY_REVIEW to OWNER_ACCEPTED or release GO.

## Sparkline follow-up — real query timeout, not stale seal

Focused sequential GETs reproduced R-WFO-023 200→503→200; the public refusal
is `RESEARCH_RUN_LIBRARY_UNAVAILABLE` / "Research Run Library is temporarily
unavailable." Both new diagnostic sessions were logged out. PostgreSQL records
statement timeout at 07:13:49.454 and 07:16:20.764 UTC, matching the probes.

The retained OOS sparkline query repeatedly scans/casts its FOLD relation for
each OBSERVATION. A scoped, materialized fold-bound CTE removes that repeated
work; it retains the same authorized workspace/run/artifact revision, RLS,
membership check, OOS inclusive boundary, extrema sampling and 192-row bound.
No index, cache, migration, API/UI change, retry masking or SLO relaxation.

Actual read-only QA-member/RLS query comparison on the same preview rows:

| Run | Old query | Fold-bound variant | Rows / result digest |
|---|---:|---:|---|
| R-WFO-023 | 1,469 ms | 21 ms | 151, identical |
| R-WFO-022 | 1,399 ms | 14 ms | 151, identical |

Both row results SHA-256:
`e9282eb4440a70c6728a28589107ee5f0d3075b8ca195c58d12faf187ce4a2c1`.
The product timeout stays **1,500 ms**. The diagnostic allowed 2,000 ms only
to finish measuring the old query; that is not a runtime config/gate change.
This proves query parity/latency, not that the shared HTTP runtime was upgraded.
The query correction is in `ResearchRunLibraryRepository.findRetainedSparklineValues`.
Focused Library admission/service tests: **45/45 PASS**.

Private evidence (same private directory as the import receipt):

- `section32-sparkline-diagnostic-retry.json` SHA-256
  `4d608e8ccb0d965489c207752601b09be286961c138f095da8bb901d9d2eabad`.
- `section32-sparkline-refusal-body.json` SHA-256
  `81f90e1593bd9743dd0faeb7865a1537defc7dca9355c3c67317cc2d62c55a7f`.
- `section32-sparkline-query-diagnostic.json` SHA-256
  `8b4ff063c99f6b07a68b3526234b19b07299684f784a152e14732c1fa9c37886`.

The first full mandatory gate reported 1,932 Control passes / 2 failures / one
named skip; it was NOT accepted or committed. Its historical P04 golden rejected
the explicitly requested additive applicability field. The golden bytes were
not rewritten: the test now asserts this field is null for unpublished historical
targets, then compares all original core/pin/fingerprint content byte-for-byte.
The focused golden retake passes. The coherent corrected gate remains required;
no bypass, baseline update or weakening of immutable source assertions.

The other failure was the Compare negative-case regression: a malformed retained
manifest must keep its existing typed PARTIAL response, not escape into the new
SHA-256 field and turn the whole read into 503. Source manifest disclosure now
requires a sealed artifact revision and a valid lowercase SHA-256; otherwise it
is null and the original binding refusal remains. Valid left/right artifact
digests and null negative paths are explicitly asserted. The subsequent full
gate was stopped at this known failure to avoid spending resources on a doomed
run; its disposable cell was cleaned. This is a backend boundary correction,
not a fixture rewrite or an accepted red gate.

Focused corrected Compare/service/fixture plus historical P04 golden retake:
**31/31 PASS**. The supported imported real-run receipt remains the same;
these corrections neither rerun that child nor overwrite its original bytes.
