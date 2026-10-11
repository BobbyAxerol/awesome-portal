# §56 — Optional Governance source references and per-run R1 claim ids

Date: 2026-10-11. Branch: `docs/research-loop-plan`; parent `b70d0559`.
Scope: additive backend metadata requested by Claude, not a Governance UX redesign.
The delivery commit is the commit containing this packet; no remote push or rollout.

## Delivery

| Request | Existing operation | Published type/fields |
| --- | --- | --- |
| Checklist source | `executionGovernanceR1Review` | `components["schemas"]["R1ChecklistItem"]`: optional `evidence_ref` (`R1EvidenceReference`) and `evidence_ref_reason` |
| Run methodology choices | `researchRunLibraryListV1` | `components["schemas"]["RunLibraryItem"]`: optional `eligible_methodology_claim_ids`, `methodology_claims` (`RunMethodologyClaim[]`), `methodology_claims_availability` |

Both contracts preserve historical responses that omit the new fields. New backend
responses include explicit null/typed reasons when facts are absent. Existing status,
gate, order, eligibility, mutation and error vocabulary remain unchanged.

Checklist references resolve `basis_hashes` against the already integrity-verified
immutable R1 evidence manifest. Only explicit Research kinds are linkable. An
`ALPHA_ARTIFACT` maps to `RUN`, **not REPORT** merely because its label mentions a
report. REPORT/FREEZE/AUDIT require their explicit recorded kind and artifact id.
All basis hashes must be recorded and map to one unique source; ambiguous or
unsupported evidence stays null. No manifest bytes/hash are rewritten.

Library joins `public.run_read_models` after the existing limit+1 bounded page,
by exact workspace + run id, in the same fresh-membership, repeatable-read,
read-only transaction. It reads the same ids as R1 POST, not Progress prose.
Existing migration045 already grants the runtime role SELECT; **no migration**.
No source refresh, RunSync, bridge write, N+1 read or authorization cache is added.
The existing exact-byte pure calculation memo includes the new row fields, so
changed claim ids invalidate mapping reuse. Wire/source bounds:64 ids,191 chars/id.

## Facts that are still honestly absent

- A run without an R1 intake read-model row returns `R1_INTAKE_RUN_NOT_PUBLISHED`.
  GET does not materialize a P22 bridge or silently make an unsealed run eligible.
- A recorded empty eligible-id array is `AVAILABLE` with `[]`, not unavailable.
- Noncompleted or differently bound intake source stays null with its typed reason.
- The intake model stores ids, **not per-id grade/state associations**. Each known
  id therefore returns `grade:null`, `state:null`, and
  `R1_CLAIM_GRADE_STATE_NOT_RECORDED`. Library's existing run-level `certificate`
  and `claim` are unchanged; they must not be assigned to every id.
- Current R1 requests with no persisted findings still have `checklist:[]`.
  This slice does not invent checklist rows or a methodology certificate.

## Examples

These are canonical **synthetic** wire examples backed by equivalent isolated
PostgreSQL tests, not observations of a new product run or browser acceptance.
Fixture: `packages/contracts/fixtures/governance-review-sources.synthetic.valid.json`.

```json
{
  "evidence_ref": {"kind":"RUN","id":"run_5512","run_id":"run_5512"},
  "evidence_ref_reason": null
}
```

```json
{
  "eligible_methodology_claim_ids": ["claim_1"],
  "methodology_claims": [{
    "id":"claim_1", "grade":null, "state":null,
    "metadata_availability": {
      "state":"NOT_PUBLISHED", "reason_code":"R1_CLAIM_GRADE_STATE_NOT_RECORDED"
    }
  }],
  "methodology_claims_availability": {"state":"AVAILABLE","reason_code":null}
}
```

## Test and acceptance boundary

- Focused backend:4 files,71 tests PASS (mapping, source/absence, stale memo,
  malformed/over-bound source and bounded same-workspace SQL).
- Published contracts:2 files,6 tests PASS (optional backward compatibility,
  null/reason pairing, unsafe refs/ids, cardinality, generated type names).
- Control API build and frontend generated-type compatibility (`tsc -b --noEmit`)
  PASS, with no frontend source edit. Ordinary root commit hook is required;
  logs: `/home/bobby/.local/state/portal-governance-s56/20261011/commit-hook.log`
  (first attempt retained) and `commit-hook-retry.log` (required final retry).
  The ordinary hook runs the new real-PG tests alongside the existing security suite:
  R1 response links the recorded run without changing manifest hash or eligibility;
  Library excludes foreign-workspace ids, sees subsequent id changes, and rejects
  a member immediately after revocation, using the existing runtime role.
- First hook caught an invalid new test seed: nonempty claim ids lacked the
  required artifact hash/schema/creator. PostgreSQL rejected it correctly via
  `run_read_models_artifact_shape`. Fixed only the seed, not schema/rights/code;
  exact single-case PG retake PASS (353ms; other4 cases intentionally filtered).
  Required ordinary-hook retry follows; the failed attempt is not relabeled PASS.
- No claim that fixtures prove a production/browser positive lane. Preview runtime
  is not rebuilt in this slice. No engine, load/DR, visual matrix or baseline rerun
  for unchanged worker/storage/UI. Required commit hook is not bypassed.
- C4: disk free approximately165GiB before verification; hook owns and tears down
  its disposable containers/network/temp tree. No broad prune, DB business-data
  cleanup, backup deletion, production/dev/stable/Edge restart or flag change.

## Claude handoff

1. Consume generated Governance and Library types, not server prose. Keep the
   agreed3-row right rail, `INCOMPLETE` copy, components and visual design.
2. A checklist reference names its **actual kind**; RUN is not a Report assertion.
   Navigate with `run_id` and preserve the approval's `workspace_id`; do not send
   `artifact_id` to a run route. Target Report/Freeze/Audit readers still enforce
   their own capability and availability. Null reason means nonclickable typed
   absence; never infer a destination from the finding label/hash/id prefix.
3. Use Library's `eligible_methodology_claim_ids` for the New request selector;
   `methodology_claims` may show id plus only non-null source-bound metadata.
   Distinguish `[]`, null and omitted legacy fields. No default fabricated claim id.
4. The list is not permission. Keep POST/R1 as final authority: ids, source status,
   binding, workspace, current rights and freshness are rechecked at mutation time.
   A stale selection can still receive a typed refusal; render it honestly.
5. Backend code/contracts are delivered only after normal-hook commit. Claude's
   frontend adaptation, preview build and affected real-API browser receipt are
   next; no full visual re-record is requested by this metadata-only handoff.

Verdict: `BACKEND_CONTRACT_READY_AFTER_NORMAL_HOOK`; not full product/release GO.
