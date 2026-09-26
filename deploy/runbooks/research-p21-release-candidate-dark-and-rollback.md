# Research P21 Release Candidate composer — dark admission and rollback

## Purpose and scope

This runbook governs the **Portal-local** P21 Screen 11 composer. It is not a
publication, Governance approval, Trading System, Execution Edge, broker,
QuantBT worker, source-data or CLI runbook.

Default profile value:

```dotenv
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false
```

No production rollout is authorized by this document. Normal deployment and
change-control rules still apply.

## Preconditions for a controlled non-production admission

1. The candidate release is built from an immutable reviewed commit and its
   normal Control API migration mechanism has completed successfully.
2. `CONTROL_API_FEATURE_RESEARCH_REPORTS=true` and
   `CONTROL_API_FEATURE_RESEARCH_LINEAGE=true` are true in the same
   profile. Release Candidate admission must fail closed otherwise.
3. P21 focused service/controller/contract tests, generated-contract snapshot,
   disposable migration/immutability proof and Control API compile have passed
   for that exact commit.
4. A Screen 11 browser/HiFi receipt has separately verified the same-origin
   contract. A test double must be labelled as a test double.
5. Operator confirms that P21 stops at local seal. No P22 publication,
   Governance mirror, Execution command, QuantBT invocation or source/
   artifact-byte transport is present in the change.

## Admission check

1. Render the target profile; confirm the three feature flags above and no
   unrelated execution/command flag changes.
2. Start the normal release workflow. Do not edit an immutable release
   directory or inject SQL manually.
3. Authenticate as an authorized workspace member and call the compose route
   for one known test run. Verify private/no-store response headers and a
   typed response with exactly 17 fields and 12 pack items.
4. Exercise a failed precondition (scratch, missing fact or malformed source)
   and confirm `may_seal=false` with a typed block reason.
5. If a controlled test creates a local seal, confirm the returned lifecycle
   remains `NOT_DELIVERED` / `NOT_APPROVED`; no approval/outbox/Execution
   operation may appear. Record only safe IDs/digests in the release journal.

## Abort / rollback

1. If contract, source integrity, access control, response bound or browser
   behavior is wrong, stop admission and set
   `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=false` through the normal
   profile/release workflow.
2. Do not delete immutable P21 packs, retention pins, drafts or any existing
   Research facts. Do not run `VACUUM FULL` as a rollback shortcut.
3. Verify P21 routes return their typed dark/unavailable refusal and unrelated
   Research/Execution API health remains unchanged.
4. Capture safe evidence: candidate revision, profile revision, UTC timestamp,
   command/result class and regression test reference. No credential, source
   relation, raw artifact path, cursor or business payload belongs in a ticket.

## P22 publication intake (separate flag)

P22 publication has its own flag, dark by default:

```dotenv
CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION=false
```

- It requires `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATES=true`; the
  Control API refuses to start otherwise.
- **On:** a sealed, current candidate may record one actor-bound publish intent
  and call the unchanged R1 create service (`POST
  /api/v1/research/release-candidates/{rc}/publish`).
- **Off:** no NEW intent is recorded and nothing downstream is contacted (no
  RunSync refresh, no Governance read or create). The publication read answers
  `may_publish=false`, `blocked_reason=P22_PUBLICATION_INTAKE_DISABLED`; the
  P21 compose action says the same. Compose, draft, local seal, the pack read,
  the publication read / R1 mirror, and the replay of an intent already
  recorded as `PENDING`/`UNKNOWN` (reconciliation by its original actor) keep
  running, so turning intake off never strands an outcome.

### Admission

1. Only after the P21 admission above and a real final-audit run whose RunSync
   read model exists (P22 README, audit B8), in a non-production cell.
2. Set the flag through the normal profile/release workflow; confirm the
   publication read of one sealed test candidate returns `may_publish=true`
   only when the source is `AVAILABLE`.
3. One controlled publish: record the RC id, approval id, receipt digest and
   R1 evidence-set hash only. `DELIVERED` is a receipt, not an approval.

### Rollback

1. Set `CONTROL_API_FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION=false`.
   Leave the P21 flag as it is unless P21 itself must stop.
2. Do not delete publication intents, receipts, P21 packs or R1 approvals, and
   never revoke an approval as a rollback shortcut.
3. For an intent left `UNKNOWN`, its original actor may retry from Screen 11
   (same request, same key); the flag does not block that replay.

Never flip a UI label from `SEALED_LOCAL` to `PUBLISHED` by configuration or
manual SQL: Screen 11 prints `PUBLISHED` only from the server's delivered
publication facts.
