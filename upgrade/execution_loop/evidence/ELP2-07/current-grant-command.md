# ELP2-03/07 — Exact command correspondence and final receipt clock

## Approved follow-through — 2026-10-17T09:47UTC

Active Bobby02–11 backend assignment, Unified§14.13. Branch
`docs/research-loop-plan`, baseline
`d483357a416f7944d06ab8d4e2a80062656dac92`, own changes UNCOMMITTED.
Peer's current-access correspondence code is preserved; its source pin and
index are now released. No frontend, PM/Edge worktree, credential, runtime,
upstream command, Live activation, remote push or release/deploy change.

### Implementation and review disposition

- `command-current-authority.ts` binds the existing authorization receipt/
  membership/mapping triple to one exact accepted Core grant, resource,
  environment and action. It uses the **actual final DB clock/context**, full
  DENY/ancestor graph and half-open validity. Another ALLOW cannot rescue the
  receipt-selected grant; ambiguous matches fail closed. Opaque delegation refs
  retain their meaning and are not parsed as Core grant IDs.
- Only a genuinely absent current-authority extension retains existing legacy
  singleton behavior. Present null, undefined, malformed or unqualified input
  cannot fall back. No private/public DTO or PM payload/schema change.
- Ordinary new ACCEPTED receipt attachment revalidates binding after awaited
  writes, before transaction completion. It requires effective<=DBnow<expiry
  at initial/final checks, including the legacy absent-extension path.
  REJECTED/UNKNOWN observations and authenticated historical exact ACK remain
  immutable; historical replay does not require today's grant to exist.
- Independent review requested these two ordinary-intake corrections; both
  implemented with regressions. Native source authentication, installed trust,
  a held PM-revoke fence and physical TS COMMIT are **not** proved by this code.

### Tests and resource gate

New actual-PG suite has15 expanded cases: exact paper/live receipts for two
resources; independent-ALLOW substitution negatives; absent/present-invalid
compatibility; actual command/events/audit INSERT followed by session revoke/
expiry or selected-source-target revoke/expiry, full rollback and zero send.
Positive synthetic dispatch remains DELIVERY_UNKNOWN, never a fake APPLIED.
Component suite covers selectors, ancestry/DENY, ambiguous receipts, original
DTO compatibility and final-context forwarding. Existing actual-PG access
suite gains6 cases: post-event ordinary rollback/retry/historical ACK, legacy
future/expired ACCEPTED rejection, and unchanged REJECTED/UNKNOWN recording.
**All additions NOT_RUN at entry**; no fixture presented as native authority.

One sequential normal hook is the acceptance/landing gate for the coherent
owned backend batch, including the corrected policy fixture. Resource ceiling
4CPU/4GiB/8GiB transient for the correctness cell, no parallel HK/load/browser.
Controller under private state `20261017/followthrough-land-<UTC>/controller.json`
pins every owned source/docs path, HEAD/index, eight protected runtime tuples,
resource IDs, log hash and cleanup. No bypass or threshold change. Terminal
results supersede this pending entry only after review of the actual receipt.

### Exit, rollback and next work

Portal implementation APPLIED / NORMAL_HOOK_PENDING. No source commissioning
or full03/07 PASS. Rollback the new helper/call-site checks only if necessary;
retain all accepted events, proposals, command receipts, idempotency keys and
audit. No runtime migration is introduced by this command slice.

Backend next: normalized qualified source→Manager, remaining exact command/
parent/workflow adapters and authenticated realtime factory; policy-only
METRICS/RESTATED and Composition/Regime recalculation remain real code debt.
Actual issuer/grant installation, approved numeric budgets/calibration and
matched coexistence/G2 remain external acceptance dependencies, not defaults.
Claude **NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW**. Existing
command preview/status generated types and four outcome dimensions stay stable;
show source-disabled/unknown state, never infer permission from an ALLOW badge.
No new frontend field or duplicate request ID; existing07-001/002 track this.

## Actual focused result — 2026-10-17T10:21:54UTC

**15/15 actual disposable-PG command cases PASS**, including exact selected
receipt paper/live, post-write session/native-target revoke/expiry rollback
and zero-send negatives. Component25/25 and transaction11/11 PASS; APIbuild
PASS. Controller `20261017/followthrough-check-focus-101752/controller.json`,
logsha256 bb0da87a25044bb2aacadd74dd3567f606b413a5746662b8357746c76e0f139a,
under the commissioning state root. Source/index/eight protected runtime
tuples unchanged; own Node/PG/network and lease cleaned. Overall focused
batch123/125,2FAIL in separate reader fixtures, so its scoped restore NOT_RUN.
Those fixture assumptions were corrected without relaxing policy; reader-only
75/75retake is recorded in04. No summing overlapping counts into unique coverage.

The earlier coherent normal hook failed this command suite at SETUP because
its test credential contained a blocklisted substring. That failed receipt
is preserved in10; changed ONLY the labelled test credential, not real users,
password policy or auth permissions. The15cases above now genuinely executed,
not skipped tests presented as PASS. Ordinary-intake6new cases also pass in
the128case access suite from the normal-hook result. Native installed PM
current-human/physical-COMMIT/revoke qualification remains unproven and OPEN.
Coherent normal-hook/restore/commit pending; no upstream dispatch activated.
