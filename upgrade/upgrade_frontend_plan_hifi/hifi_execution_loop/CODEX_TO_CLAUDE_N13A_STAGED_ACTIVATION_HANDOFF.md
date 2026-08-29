# Codex → Claude — N13A staged activation handoff

Backend status: `PORTAL_FOUNDATION_COMPLETE / SOURCE_DARK / N13B_OWNER_RETURN_PENDING`.

## Consume now

Use the generated `execution-staged-activation.d.ts` reader and the three
canonical fixtures. Do not maintain a browser-local delivery-profile state
machine and do not infer authority from Query/SSE health.

The seven capability rows are independent. A change in `QUERY` never changes
`SSE` or R1–R4. The current truthful rendering for all seven is:

```text
effective_profile=fixture
source_enabled=false
runtime_enabled=false
kill_switch_engaged=true
```

## Required seven-state UX

Implement and test the canonical corpus in
`execution-staged-activation.states.valid.json`:

- `fixture`: neutral source-dark state;
- `denied`: illegal transition, no retry-as-success;
- `incompatible`: exact revision/digest mismatch;
- `stale`: expired evidence reference;
- `partial`: incomplete immutable evidence set;
- `rollback`: bounded rollback is ready but not yet terminal;
- `restart`: verified persisted rollback recovered after restart.

Keep the primary surface compact: capability, effective/target profile, state,
one actionable blocker and recovery. Digests, signer fingerprints, request IDs
and evidence references belong in an audit/details disclosure, not as large
screen typography.

## Interaction rules

- POST plan is the only first mutation; never call apply directly.
- HTTP 202 from apply is not success. Poll/read the plan and require
  `VERIFIED` for terminal rollback success.
- Disable promotion while status is `BLOCKED|DENIED|EXPIRED`.
- A stale/conflict response refreshes the server snapshot; it does not silently
  overwrite the expected capability or plan version.
- USER can inspect capability/plan state but only ADMIN can plan/apply/verify.
- Do not synthesize `owner_accepted`, remove `fixture`, select an AWS source or
  show Query/SSE/commands as active.
- Never let one capability failure blank healthy sibling controls; rollback is
  affected-capability-only.

## Backend routes

- `GET /api/v1/execution/activation/capabilities`;
- `POST /api/v1/execution/activation/plans`;
- `GET /api/v1/execution/activation/plans/{plan_id}`;
- `POST /api/v1/execution/activation/plans/{plan_id}/apply`;
- `POST /api/v1/execution/activation/plans/{plan_id}/verify`.

Canonical details:
[`EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md`](../../backend/EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md).

## Claude parallel task

Build the shared profile/status component and seven-state test matrix now.
Wire it only to the source-dark API/fixtures. N13B will later replace the
owner-pending evidence state one capability at a time; it will not change this
component's plan/apply/verify semantics.
