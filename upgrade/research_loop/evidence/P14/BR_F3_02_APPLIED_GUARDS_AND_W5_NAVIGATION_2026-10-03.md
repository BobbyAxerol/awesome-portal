# BR-F3-02 and W5 — applied guards and source-bound navigation

2026-10-03 · Codex backend · `codex/be-gaps` → `docs/research-loop-plan`.

Verdict: **SCOPED_BACKEND_ACCEPTED**, gated by the normal grouped commit hook.
The delivery commit is the commit containing this file (`git log -1 --format=%H
-- <this path>`). This is not W5 browser, P23/P24, product or release acceptance.
Bobby approved BR-F3-02 and the two W5 comparisons; no new campaign is opened.

## 1. Scope and source authority

BR-F3-02 now checks actual retained purge/embargo windows against the exact
same-seal OBSERVATION index and native fold counts. Train/test disjointness
alone, calendar subtraction and a configured value are not applied proof.
The API publishes independent `PASS` / `FAIL` / `NOT_CHECKABLE` verdicts under
`guards.purge_applied` and `guards.embargo_respected`, with per-fold configured
and observed bars, reason codes and verified `DATASET_TAIL` clipping.

Explicit zero guards require a retained empty window. Missing facts are not
zero. Missing configuration, native windows, fold counts or observation-index
witness stay `NOT_CHECKABLE`. Known contradiction dominates another fold's
missing fact. Aggregate PASS requires at least two checkable folds.

The proof basis is `RETAINED_OBSERVATION_INDEX_AND_SOURCE_FOLD_GUARDS_V1`.
It attests native temporal guard windows/index membership, not strict-OOS
candidate selection, future-fold nonleakage, holdout or certification.
Two scoped finite SQL reads supply a census and at most 2,560 endpoint
timestamps; no per-fold SQL loop, browser source tape or HMD scan is added.

The source/manifest/seal/Report/RC identities are unchanged. Only Split's
public representation ETag changes to `S05_APPLIED_TEMPORAL_GUARD_V3`.
No migration, new optimizer run, engine source modification or source backfill.

## 2. W5 confirmed defect and bounded correction

Before receipt: private `br-f3-02-w5-before-20261003.json`.
On retained causal run `rrun_becde1e160a2770d49246f7f665208ce`, P11's claim
handoff carried cumulative trial 6, while Search/Freeze selected native
`study_1.trial_2`, study-local ordinal 3. RC's existing number was null.
This was a real named-read mismatch, not a request inferred from UI prose.

The public Progress navigation projection now binds the handoff to exactly
one matching fold selection, native source trial ID, study and parameter
digest. It publishes local `trial: 3` and retains `progress_trial_ordinal: 6`
as the counter. Private ingress/journal and claim text remain unchanged.
Global profiles preserve their ordinal and disclose `RUN_GLOBAL` scope.
Missing, ambiguous or mismatched causal selection withholds the cursor and
publishes a typed `handoff_cursor_reason_code`, never a guessed θ*.

RC **reuses** `selected_trial_number`, with optional typed
`selected_trial_number_scope`, `selected_trial_source_id` and
`selected_trial_study_id`. It uses the shared source-backed Search/Freeze
presentation rule. There is no parallel `selected_trial_ordinal` field and
no parsing of rail text or a qualified trial ID.

Actual causal read excerpt (not a synthetic example):

```json
{
  "handoff_cursor": {
    "fold": 2,
    "trial": 3,
    "params_digest": "71272c0fefb23ce13e59ab734551ca9d825a0170e45524a715407aa6690698ac",
    "trial_scope": "STUDY_LOCAL",
    "source_trial_id": "2",
    "study_id": "1",
    "progress_trial_ordinal": 6
  },
  "selected_params": {
    "param_set_id": null,
    "param_set_id_availability": { "state": "NOT_PUBLISHED", "reason_code": "P21_PARAM_SET_ID_NOT_PUBLISHED" },
    "selected_trial_number": 3,
    "selected_trial_number_availability": { "state": "AVAILABLE", "reason_code": null },
    "selected_trial_number_scope": "STUDY_LOCAL",
    "selected_trial_source_id": "study_1.trial_2",
    "selected_trial_study_id": "1"
  }
}
```

## 3. Real read receipt and independent native oracle

Owned project `portal-research-p23-ol12`, loopback `:8096`, worker **OFF**.
No shared `:8095` or production service was changed.

Reusable runner: `scripts/research-p23/applied-guards-receipt.mjs`.
Exact private receipt (0600):
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/br-f3-02-w5-bounded-final-20261003.json`.
Real execution: **06:21:33–06:21:46 UTC, 22 controls PASS**, session logged out.
Receipt-byte SHA-256:
`d486fafc57ddd1ddc5da2e9605506fd8f6be40332fd868b1a785fb6cf3805a40`.

| Read candidate | Exact image ID |
| --- | --- |
| Control API | `sha256:b3453972f205af0f229e08f9de922f2fbc2c5df133055b8750dde25194fa194c` |
| Portal Python / installed QuantBT 1.1.1 oracle | `sha256:66cfd8cfd20f1a8fa156984ed1aad56f321dae0cedcb552b2c89fdb28a31b100` |

The receipt records baseline `c1276a7d` plus exact source-module hashes and
image IDs; the tested candidate includes this then-uncommitted slice, not
an assertion that baseline alone contained it. Native installed `_build_fold_v2`
source SHA-256 is `03170897e798cb5a93ec2bad69bbb024b16a21d2b74a813e118aeeb5e1e9a528`.
The oracle verifies every retained manifest/Parquet part's bytes, row metadata
and same-seal summary, then uses that installed native builder and retained
index/configuration to compare train, test, label, purge and embargo windows.
It does not reuse the TypeScript proof implementation or run an optimizer.

The earlier pre-bound receipt is retained, not overwritten:
`br-f3-02-w5-final-20261003.json`, byte hash
`868f6a3bca52e32ee7bd4c04d944c18c173d3281263968de563bf73084233ef3`,
Control image `sha256:8d6ae8fdc7be9d5fba3e813b901de0c6edb77bf7e0ec005a19ea44bac1a28b70`.
The final receipt supersedes it for the bounded public-cursor correction.

| Retained run | Observations / folds | Actual guard result |
| --- | --- | --- |
| `rrun_6b076ba549a4f8ffef4307afcc2cfeab` | 744 / 3 | purge 2 each; embargo 3, 3, 0; last fold verified tail clipping; label horizon 1 |
| `rrun_78d9ef519a64da31aa2fe086cd21b6f7` | 1,056 / 2 | purge 2 each; embargo 3, 0; last fold verified tail clipping; label horizon 1 |
| `rrun_49142d25954abd176d3c2bd0f44b51e2` | 1,056 / 2 | explicit zero guards; global navigation regression |
| `rrun_becde1e160a2770d49246f7f665208ce` | 1,056 / 2 | explicit zero guards; causal Progress→Search/Freeze→RC parity |

Repeated Split reads retain body/source revision/ETag; conditional GETs return
304/no body. Foreign workspace returns 404; anonymous request returns 401.
Custody digest before = after:
`885fe32cc292297d424edf228136f5a02e41076664ac5196faf96b4f48268222`.
No retained source, Report or RC pin was rewritten.

This cell has no historical seal missing guard configuration/windows; do not
claim a real missing-window historical receipt. Such negative paths are
covered by strict contract/helper/service tests, including the existing
real-HMD fixture without OBSERVATION rows. It honestly returns NOT_CHECKABLE.

**Hook correction:** the first normal grouped hook refused one old W7 exact
RC expectation (1,830 Control tests passed, one failed, one skipped). It omitted
the three new structured fields; the test now asserts their exact run-global
values, not a weakened partial match. Public causal projection also withholds
a source-local ordinal outside the existing public integer bound, covered by
a negative navigation test. The final bounded candidate/receipt and hook retry
gate landing; no engine/source/FE contract is widened.

## 4. Focused gates and generated contracts

- Control API build: PASS.
- Combined 8 Control suites: **88/88** (applied guards, scoped repository,
  W3 facts, W5 navigation, Progress truth/contract, RC service/companions).
  This overlaps the earlier 59-test guard/service run; counts are not additive.
- Final post-hook W5/W7 correction: **29/29**, Control build PASS; exact RC
  field assertions and the bounded causal-ordinal negative both pass.
- Final 2 published-contract suites: **7/7**, including old capture/private
  cursor compatibility, strict anti-leak fields and generator determinism.
- Full official `npm run generate`: PASS; all three changed amenders' `--check`
  and contract snapshot **273/273 files**: PASS.
- New receipt runner syntax: PASS. Normal grouped commit hook gates landing;
  full hook output is retained by the terminal result, not substituted with
  focused/fixture acceptance. No redundant frontend rebuild/baseline update.

Generated types: `research-current-source.d.ts` → `AppliedTemporalGuardProof`
and Split guards; `research-progress.d.ts` → `ProgressSnapshot.claim` public
cursor/reason; `research-release-candidate.d.ts` → `SelectedParams` /
`ComposeResponseP21`. The private `ProgressHandoffCursor` schema remains the
original three-field journal contract. Added public fields are optional so
old captures remain readable. New JSON fixtures are **synthetic contract
fixtures**, not evidence of real runtime/source facts.

## 5. Claude W5 consumer handoff

1. S05: consume both applied guards with their own verdict, reasons and counts.
   Do not turn disjointness/configuration into applied PASS. Show tail-clipping
   disclosure; absent old facts remain NOT_CHECKABLE, not zero.
2. Progress: use public `handoff_cursor.trial` for Search/Freeze reset/navigation;
   show scope/study from typed fields. `progress_trial_ordinal` is a run counter
   only. Null cursor plus typed reason means no reset affordance/default θ*.
   Current W5 `handoffCursor.ts:cursorForHandoff` / `HandoffTarget` retain only
   fold/trial/params. Its study selector must bind the published fold to the
   delivered native study (or preserve that typed identity); the new metadata
   is not automatically consumed just because the generated type exists.
   Validate this explicitly in Claude's causal browser receipt; no rail parse.
3. RC/S11: use the existing `selected_trial_number` and availability with the
   delivered scope/source/study fields. Do not add a duplicate ordinal or parse
   rail strings. Source trial ID is identity, not a display number.
4. P11 fold is a navigation ordinal; native opaque fold IDs must come from the
   published fold navigation. Do not guess `fold - 1` for request parameters.
5. Backend named-read selection parity is accepted. Claude still takes the actual
   W5 browser round trip on its next rebuilt preview. No browser/visual receipt
   is claimed by this backend packet; no frontend file/layout was edited.

## 6. C4 and remaining gates

Before teardown: zero queued/claimed/running/cancel-requested jobs, zero active
QA sessions, 21 disabled non-owner QA identities; owner anchor retained.
Exact `cell.mjs down` removed only the six owned containers and their network;
**no `-v`, volume/data/image prune or business data deletion**. Rollback images,
retained artifacts, DB volumes and private receipts remain recoverable.
After final teardown: owned project has zero containers, root 188 GiB free
(70% used), 10,987 MiB available RAM. Cleanup decision **NO_ACTION_NEEDED** beyond that
bounded teardown. Shared preview, Claude checkout, dev/main and production
are untouched; no remote push.

Concurrent integration: Claude landed `e7414e1f` / `c4d84d1a` while the first
hook ran (69 frontend/docs files). The backend lane fast-forwarded to that
same Research head with all its staged changes preserved, no conflict or
frontend edit. This backend commit is based on that head, not an overwrite
of Claude W5; its continuing uncommitted FE/browser work remains untouched.

Next backend scope remains the already-listed coherent P23 load/restore,
actual engine-two T07/T13, independent WFO recomputation and remaining
negative/browser aggregation, followed by P24. This closes BR-F3-02 and the
two backend W5 issues without declaring those downstream gates green.
