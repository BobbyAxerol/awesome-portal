# Approval Inbox subject type — Core → Claude, 28 October 2026

Status: **SOURCE CANDIDATE; NOT LANDED, NOT RUNTIME-VERIFIED**. Responds to
the Approval row subject-type request in Claude's frozen candidate hand-back 2.
This is an additive source contract, not a connected-source or browser receipt.

## Fact and contract

`governance_approval_requests.subject_type` is already persisted and constrained
to `ALPHA_VERSION`, `DEPLOYMENT`, or `EXIT_REVIEW`; the existing inbox and
decision-inbox views project the original column. The authorized, workspace-
and gate-scoped inbox query now selects that column and returns `subject_type`
on each row. It does not infer a type from a gate, label, ID prefix or fixture.
The new property is optional in the published schema so old servers remain valid;
the new producer emits it. The generated type is
`components["schemas"]["$defs-ApprovalInboxItem"]` in
`packages/contracts/generated/execution-governance.d.ts`. The canonical synthetic
inbox fixture carries `subject_type: "ALPHA_VERSION"`.

The subject type and ID are **navigation hints, not authorization**. In
particular `ALPHA_VERSION` must not be assumed to be an Alpha 360 ID, and
`EXIT_REVIEW` must not be invented into a deployment ID. Resolve any target
through its published authorized relation; a target read must enforce current
workspace/resource access independently. If the relation isn't available,
leave the link disabled with its existing reason.

## Claude consumer handoff

The existing `screens/cockpit/inboxRowV2.ts` reads the subject ID but does not
surface the type. Add explicit optional enum validation and typed consumption,
accept an old response without the property, test malformed/unrecognized values
and verify each permitted link and denied/missing target in the product browser.
Do not parse the label, guess the target, or infer a grant from this field. No
frontend component or design was changed in this backend slice. Coordinate the
new reader/fixture with backend before installing a candidate; old closed-schema
consumers outside the inspected V2 reader should also be checked.

## Verification and boundary

- Core `governance-inbox-portfolio.spec.ts`: 16 authorized mapper, scope and
  refusal tests PASS; 9 PostgreSQL-specific tests not selected. Three new cases
  independently check the persisted type even when the gate/label do not match.
- `execution-reader-refinements.spec.ts`: 5/5 PASS including accepted enum,
  rejected unknown/null values, optional compatibility and canonical fixture.
- OpenAPI TypeScript regenerated from the published schema;
  `snapshot.py --check` PASS (710 tracked inputs). N29 and EDS-12 digest-only
  refreshes have `runtime_effect: NONE`, not production qualification; their
  static verifiers and execution tracking reconciliation PASS.
- Control API `tsc --noEmit -p tsconfig.build.json` PASS on this candidate.
- No migrated-DB HTTP, browser, Edge, connected-source or deployed-image test
  is claimed. Final hook, R2 integration and landing are tracked in the candidate
  handoff; the prior three frontend test edits remain separate.

No remote push, migration, runtime install, command/Live enablement, or source
data mutation. This field does not close ELP2-10 or ELP2-11.
