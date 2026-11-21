# §31 — stale seal, typed exit and approval read

Scope: Bobby's 2026-10-03 request, queue §31 (Claude W1–W5) and its real
publication addendum. Backend, additive generated contracts and handoff only.
No frontend edit, shared-preview restart, engine run, seal/publication write,
Governance grant/decision, migration, remote push or production change.

## Inputs and defect

Read Unified §13/P22, Guide P22, P22 README/phase-report/rollback, queue §31 and
addendum, P21 W1/W2 and broad-request reconciliation receipts, both reader
implementations, actor-local draft/seal repository and R1 authorization checks.
Claude's real :8095 evidence names R-WFO-022
(`rrun_a76afa62adb6c427ba2f4cec44bb43bd`,
`rc_06GFW43NE42YF64NMXYDS6GD32`) and R-WFO-023
(`rrun_3d5633d2adb712722fe4ba108102aa5d`). Local seals existed but compose said
`P22_LOCAL_SEAL_REQUIRED`; publication said `P22_CURRENT_SOURCE_CHANGED`.

Root cause: `publicationFacts()` collapsed seal **existence** and equality to
the **current** source fingerprint into one boolean. `localSeal()` correctly
retained SEALED_LOCAL/PARTIAL with
`P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT`. Composer was wrong;
neither a missing seal nor missing artifact bytes was the cause.

## Delivered mapping

| Fact | Exact response/guidance |
| --- | --- |
| Existing stale seal, both compose and publication | `P22_CURRENT_SOURCE_CHANGED` / `CREATE_NEW_RUN_AND_SEAL`, publish disabled |
| No local seal | `P22_LOCAL_SEAL_REQUIRED` / `SEAL_CANDIDATE` |
| Already delivered old candidate | Immutable receipt retained; `P22_ALREADY_DELIVERED` / `NONE` |
| Superseded publication | `P22_RELEASE_CANDIDATE_SUPERSEDED` / `REVIEW_CURRENT_CANDIDATE` |
| Intake dark / transient source unavailable | `WAIT` |

`blocked_action` is optional/additive in V1 and always served by these updated
readers. Enum: `NONE`, `SEAL_CANDIDATE`, `CREATE_NEW_RUN_AND_SEAL`,
`REVIEW_CURRENT_CANDIDATE`, `WAIT`. Guidance is not a mutation grant; NONE
does not imply permission. Actual POST still checks current pins, actor,
workspace, CSRF, claims, immutable intent and exact downstream acknowledgement.
PENDING/UNKNOWN delivery must still reconcile its original actor/key before
another R1 intent; guidance does not permit abandoning uncertain delivery.

### Lawful path after source change

1. Keep old candidate/pack/Report, fingerprint, digest, pins and receipt bytes.
2. Do not PATCH/reopen/reseal the old draft. Actor/run drafts are unique;
   `P21_ALREADY_SEALED` is intentional. Exact old seal retry returns the old
   pack, not a refreshed seal. Do not switch actors to evade immutability.
3. Use the existing New Run / new-attempt flow against current qualified
   source, retain its evidence, review its current compose and declarations,
   then seal a **new candidate** and publish normally. Inspect readiness before
   requesting compute; no automatic re-run or compute occurs in a GET.
4. The new run/attempt/RC has its own identity. This patch does not mark the old
   candidate SUPERSEDED or invent a supersede API. Existing current-candidate
   relation remains authoritative; old history is still readable.

## Native selected-params rail

Only `rail[key=selected_params]` gains the shared typed triple:
`selected_trial_ordinal`, `selected_trial_ordinal_scope`,
`selected_trial_ordinal_reason_code`. Present: positive ordinal, RUN_GLOBAL or
STUDY_LOCAL, null reason. Absent: null/null and typed reason. Same native
mapping as existing `selected_params.selected_trial_number`, not a second
selection identity. Causal display requires exact retained study/local-number
mapping. Never parse detail/qualified IDs or use P11 cumulative counters.
Zod and canonical OpenAPI refuse zero, mixed/partial triples and trial fields
on other rail nodes. New display/guidance fields do not enter frozen packs,
source fingerprints or pin digests. Historical fixtures remain accepted.

## R-WFO-027 — intended publisher-read policy/copy

Claude's accepted real receipt names `rrun_686af4b1d64472591b6a64a1db1233a3`,
`rc_06GG2K1TN6QQNJJN3RJ5AS5XC1`, approval
`apr_06GG2K4A9Q3AHFVK0WV5GXNCY2`, publisher `claude-preview`.
This continuation does not republish it or claim another runtime receipt.

`GovernanceService.verifyPublicationPin()` lets a publisher reconcile their
own exact R1 acknowledgement without review rights; returns only a boolean.
`GovernanceService.detail()` independently enforces the R1 read grant before
returning the full review. Research membership/publish permission is not that
grant. DELIVERED + `approval_read:DENIED` + `approval:null` is thus expected,
not failed publication. Own immutable receipt/approval ID stays readable.
No policy, role or Execution decision rights were widened.

**English copy for Claude (DELIVERED + approval_read DENIED only):**

> Published successfully. Your publication receipt is available, but your account does not have permission to view the Gate R1 review. An administrator can grant R1 read access; publishing does not grant approval rights.

This is not approval **decision** DENIED. Keep receipt/link and the rich
screen; do not infer current PENDING/APPROVED from an old acknowledgement,
promote to Paper or grant R1 decision rights. Codex did not edit frontend copy.

## Verification, handoff and C4

- Focused Control API **75/75 PASS**: initial seven-file 74 cases plus the
  additional UNKNOWN-source-drift regression (final service file 19/19).
- Generated contracts **8/8 PASS**, generator idempotence `--check` PASS;
  Control API build PASS. Only two generated targets, no full FE rebuild.
- Fixture lane is explicitly FIXTURE_ONLY. Both actual service classes run
  in cross-reader tests; stale readiness stops before Governance/bridge/intents.
  Tests do not masquerade as deployed :8095 receipts.
- P04 golden not re-recorded: normalize only asserted new live DTO fields;
  exact original fingerprint, frozen pack digest and pin checks stay intact.
- Mandatory normal commit hook gates landing; result/commit are reported
  after completion, not guessed here. First full Control API run: 1,857 PASS,
  one failure from the old W7 PostgreSQL test's exact action-object expectation
  lacking additive `blocked_action`, one opt-in DR skip. Corrected all three
  exact action expectations (WAIT/NONE/NONE); no production logic, immutability
  or authorization assertion was weakened. No repeated engine/load/DR/browser
  acceptance exercise; disposable hook cells retain their normal teardown.
- Claude consumes generated compose/publication operation types, maps guidance,
  renders rail via shared trial label, and uses copy above. GET-only preview
  receipt follows a Control API rebuild from the landed SHA. Current preview
  images do not change merely because source was committed. Do not seal or
  republish R-WFO-022/023/027 to test these reads.

C4: no phase-owned persistent stack/image/session/identity created. Normal
hook-owned ephemeral test cells are removed by their traps. No prune needed; root
186 GiB free (~29%), RAM available ~12 GiB, swap 0. **NO_ACTION_NEEDED**.
P23/P24 full product/release gates are not closed by this amendment.
