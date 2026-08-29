# Codex → Claude: N09 governance/workflow handoff

Date: 2026-08-26  
Backend status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`

## What is canonical now

Use generated contracts; do not preserve a compatibility guess once its exact
field is available:

- `packages/contracts/generated/execution-governance.d.ts`
- `packages/contracts/generated/execution-operations.d.ts`
- `packages/contracts/generated/portal-api.d.ts`
- `packages/contracts/openapi/execution-governance.openapi.json`

N09 core scope is BR-EX-30/31/32/33/35/36/37/38. BR-EX-41…58 remain accepted
intake items and are not implicitly complete.

## Required frontend integration

1. Gate every Portal governance mutation on generated `governanceWriteEnabled`
   (wire field `governance_write_enabled`). It is independent of all command
   flags and is currently false.
2. R2 must render the published R1 lineage, grant, approver role, plan author,
   evidence manifest and eligibility locks. Do not infer them from R1 fixtures.
3. Approval history must use the canonical signed `after`/`before` keysets and
   server-filtered exact counts. Never paginate or recount in the browser.
4. Add `REQUEST_CHANGES` as a distinct decision with typed remediation input.
   On success the current attempt becomes `CHANGES_REQUESTED`; do not rename it
   DENIED and do not fabricate an automatic replacement/resubmit action.
5. `Mine` means `assigned_to=me`. Show assignee separately from acknowledge and
   resolve actors; use nullable `incident_id` for the row-to-incident link.
6. R1 reads typed `known_limitations[]`; preserve kind, statement and expiry.
7. Sandbox shows the bounded immutable smoke plan as evidence. It must never
   look like an executable order or imply that source traffic occurred.
8. Keep fixture/source state honest and all mutation controls disabled while
   the registry policy is false.

## UX rules

- Put lineage IDs and digests in the evidence drawer/copy affordance, not the
  primary decision hierarchy.
- Use operator language for the main state: “Changes requested”, “R1 expired”,
  “Lineage unavailable”, “Assigned to Bobby”. Raw lock codes may appear only in
  details/support surfaces.
- `CHANGES_REQUESTED` is a terminal attempt state with an obvious remediation
  list. It is not an error toast and not a pending review.
- Missing legacy R2 lineage is an explicit unavailable/blocked state; never fill
  the space with a guessed approver, grant or evidence digest.
- Preserve the single Carbon execution grammar and existing density/copy rules.

## Acceptance cases for Claude

- policy false hides/disables writes while reads remain usable;
- R2 complete lineage and legacy missing-lineage states;
- R1 expired and evidence-integrity/eligibility locks;
- REQUEST_CHANGES plan → apply → terminal history row;
- history forward/backward keysets and filters;
- Mine shows only explicit assignment, including acknowledge self-assignment;
- linked and unlinked incident rows;
- smoke plan PLANNED/APPROVED/REJECTED plus absent plan;
- no source, broker, command or fake-live claim.

Backend evidence:
`../../backend/EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md`.

## Parallel work after this handoff

Claude may wire the above consumers and tests while Codex starts N10 contracts.
Do not wait for AWS-HK: N09 is entirely Portal-owned. Do not ask the Trading
System owner for another narrow source change; Codex will send one consolidated
N02/N03/N11 read pack after N11 is fully specified.
