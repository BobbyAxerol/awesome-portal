# Approval Evidence native custody — 4 November 2026

## Scope and source pins

Core `docs/research-loop-plan` started clean at `4b8622e50dc84e26886ecfdeb050968a1c245d3e`.
This slice adds an unmounted Core composition and its HTTP branch. It does not
install a provider, source policy, credential, grant, image or runtime. Edge
was inspected over SSH read-only at source `636d58a7c4368a617903734ab1d0ce933d2804ca`;
its current tracked/untracked work was preserved. No newer Edge-to-Core source
binding was present in the inspected mailbox. An old source observation or
expired binding is not a current permission, receipt or runtime pin.

## Implementation

- Existing dark behavior remains the default. A private, server-only native
  qualifier must first establish the exact user/session/workspace/approval,
  source relation, same snapshot and independent section grants. Approval
  visibility is checked before qualifier preparation, again around the source
  read, and the qualifier must revalidate before physical dispatch.
- A separate server-owned output-path policy maps every published leaf to its
  exact field/detail grant on a pre-admitted native selection. No policy is
  registered in AppModule. Missing policy, a missing/incorrect proof, plan
  mutation, source identity mismatch, unauthorized workspace, lost authority,
  oversized output and asynchronous final-dispatch validation fail closed.
  A positive field additionally requires an actual read of its selected
  source inside the native fence; the qualifier is still responsible for
  establishing the real data/field semantics, relation and snapshot.
- `prior_economic_history` and `evidence_diff` are not admitted via this
  CURRENT-only native composition. They need a separate HISTORY purpose and
  corresponding commissioned transport, not a renamed CURRENT grant.
- The existing native `deliverNative` holds custody through physical HTTP
  dispatch. The controller hijacks the response only at the final fence and
  destroys it after ownership on a later error. No source failure, fixture or
  visibility decision alone authorizes a published section.

## Verification and limits

Focused `approval-evidence-native-http.spec.ts`, `approval-evidence.spec.ts`
and `approval-evidence-http.spec.ts`: **83/83 passed**. The new HTTP tests use
synthetic native custody/qualifier and synthetic field policy; they exercise
positive, wrong workspace/source, missing grant/policy/proof, CURRENT/HISTORY,
plan mutation, revoke at dispatch, malformed input and async-final negatives.
They are not an Edge, PostgreSQL physical-egress, real authority or browser
acceptance receipt. Earlier overlapping runs must not be summed as new tests.

Current working-file SHA-256 values before commit:

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/approval-evidence/approval-evidence-native-delivery.ts` | `3c618bbf090dcaa9c8daaa7383302d63a641e47ffc6828e073c3860869db1991` |
| `apps/control-api/src/approval-evidence/approval-evidence.controller.ts` | `e371e018cab75cb7803701e52fdb1412457f25589490af92ef08d4263f876f1f` |
| `apps/control-api/test/approval-evidence-native-http.spec.ts` | `df97b05cd6c9cd556fe531dbac65c6c11143dcf45100844d3ab2fc31cd1d4014` |

The hashes above are a pre-final snapshot and must be replaced if subsequent
review changes those files. An initial full typecheck exited 2 on four older
tests calling the controller directly with three arguments; the optional HTTP
response was restored for the dark path and is required on the native path.
That failed run is not PASS. A later direct-file TypeScript invocation exited 2
with six existing Fastify cookie-augmentation errors because that invocation
did not include the project-wide ambient registration; it produced no other
diagnostics but is also not a PASS. The affected Vitest suites passed after
the controller correction. No connected or normal-hook PASS is inferred.

## Handoff and remaining gates

Claude may continue using the existing contract/typed absence; no UI or DTO
change is requested. Core/Edge must still agree and commission a real
source-specific section/path policy, native qualifier, approval lineage,
rights and live custody/revocation proof before mounting a positive provider.
That work must not infer HISTORY or field authority from CURRENT, approval
visibility, a fixture or a different workspace.

Research needs an actual current Paper root/delegation, independent READ and
STREAM grants, valid trust/binding and protected final source transport through
Edge. Edge/source ownership supplies qualification; no prior expired binding
was used. STATUS ACK, real financial/Approval inputs, connected browser and
G2 remain open. ELP2-10/11 are **not closed**.

Cleanup: only local source/test/docs changed; no cell, image, network, volume,
runtime or upstream state was created by the focused tests. Root filesystem
had 285 GiB available in the read-only capacity check. No broad cleanup ran.
