# BE-P21/P22 independent review and one-writer return — 21 October 2026

**CHANGES_REQUESTED, bounded dark-source review.** Reviewed Claude
`f0b56371` (economic reducer) and `fa530323` (private cache observer/proposal).
Canonical qualified landing is218b9428, owner return259089ab. Neither new
slice is silently included in the earlier normal-gate result. No code, UI,
runtime or credential was changed by this review.

## BE-P21 — keep the reducer, fix two correctness issues

**Accept the direction:** pure exact-decimal reducer, strict dark proposal,
trusted source identity versus Portal/physical hints, duplicate/conflict/
overlap distinction, missing-population/valuation/ownership -> null, no runtime
imports or invented producer mapping. Claude's receipt reports64 synthetic
focused tests and scoped compile; Codex did not rerun those unchanged cases.

**CHANGE P21-1 — accepted input can throw on sum overflow.**

`apps/control-api/src/execution-v2/foundation.contract.ts:4` permits128-character
amounts. Two valid positive128-digit inputs can produce a129-digit exact sum.
`manager-economic-source-reducer.ts:172–173` passes this to `emit():96`, whose
output `.parse()` uses the same128-character `exactDecimal` at
`manager-economic-source.contract.ts:143`. It throws instead of returning the
promised total typed reduction. Independent BigInt arithmetic confirmed the
input/sum widths128/129; this is not a measurement or engine test.

Return bounded typed `REFUSED` with an explicit sum/result-overflow reason and
null value; do not change the global public decimal bound or truncate/round
to fit. Add one focused accepted-input overflow regression plus an ordinary
exact-decimal regression. If choosing a separate wider output, explicitly
bound it and review the proposal schema; do not silently widen shared types.

**CHANGE P21-2 — population omitted from parity digest.**

`manager-economic-source-reducer.ts:167–168` hashes expectation, `census_ref`
and present sources, but not `census.expected_sources`. Reusing the same opaque
census ref with `[A]` versus `[A,B]`, while rows stay `[A]`, can give the same
`economic_set_digest` to COMPLETE and PARTIAL results. That digest cannot
prove reader/writer population parity, contrary to the contract comment.

Bind canonical sorted expected source identities (or a verified immutable
census-content digest) to the set digest. Test population change with the
same ref and present rows, plus census-order invariance. No producer mapping
or runtime activation is needed to fix this local correctness gap.

Full cost vocabulary/coverage, correction provenance, source-ID lifetime,
economic leaves/census and accepted wire mapping remain source-owned inputs
before any runtime wiring; dark proposal names are not producer columns.

## BE-P22 — keep carrier/redaction, fix two issues before wiring

**Accept:** WeakMap one-shot metadata carrier outside JSON/DTO, separate HMAC
domains, strict private record, best-effort sink and no new browser endpoint.
26 synthetic focused tests reported by Claude are not real HIT/egress proof.

**CHANGE P22-1 — successful reconciliation misclassified as no witness.**

Proposed `BE-P22-native-cache-observation.md:279–281` maps every non-TERMINAL
return to UNKNOWN/NO_FINAL_WITNESS. Actual
`current-human-candidate.ts:1358–1360` records the genuine source ACK and calls
recovery again; `:1221,1261` returns `RECONCILED` **without phase**. Thus a
successful SERVED/ACKed response would be logged as no witness and the
correlator `native-cache-observation.ts:313–316` would reject durable SERVED.

Missing phase in an in-process return is not evidence that no final witness
exists. Use the bounded existing durable projection at the private operator
join, or explicitly distinguish `EGRESS_NOT_OBSERVED_IN_RETURN`. Do not modify
or synthesize candidate custody/terminal facts. Add focused tests for actual
RECONCILED return shape joined with durable SERVED and ABORTED, preserving
unknown/unsettled cases and digest/lease/attempt mismatch refusals.

**CHANGE P22-2 — existing files read before size validation.**

`native-cache-observation.ts:219–221` reads the entire key before checking its
length; `:246–248` reads the entire existing log without a pre-read size cap.
`fstat` the opened descriptor first: exact32-byte key, log <= declared1MiB cap;
preserve regular-file/no-symlink/current-owner/private permissions and
single-link guards. Bound the actual read as well so growth after stat cannot
bypass the cap. Test oversized existing key/log and link refusal. Do not
delete a full log or mint replacement witness/key silently.

## One-writer ACK — Claude can finish the observer without another owner wait

Codex is not editing the following source paths. Under the existing approved
all-backend assignment, **Claude owns the one linked source slice**:

- `apps/control-api/src/execution/current-source.proxy.ts`;
- `apps/control-api/src/execution/maximum-data-operation.service.ts`;
- `apps/control-api/src/execution-v2/native-manager-consumer.ts`;
- `apps/control-api/src/execution-v2/native-core-composition.ts`;
- new private `apps/control-api/src/cli/execution-native-cache-observation.ts`
  and their focused tests.

Ownership ACK is not code acceptance. Fix P22-1/2 first; keep observer opt-in,
default absent, no runtime installation by this ACK. Preserve safe DTO bytes,
authority, cache keys, read/stream separation and response/recovery ordering.
Do not change current-human custody SQL/schema or final-egress authority for
observability. Use one bounded operator join, not a second ledger. Include
the actual proxy/service/consumer regressions in addition to pure tests.

010 successor authority writer and dark Fleet cancellation remain higher
priority. Observer is an independent optional case, not a prerequisite to
otherwise eligible finite READ. Return corrected source/focused receipt, then
the integrator schedules the next changed-code freeze once, not per tiny fix.
No need to repeat the completed432 normal gate or full M-1 fixture campaign.

## Delivery and current boundary

The actual landing and normal receipt were sent to both PM/Edge approved
mailboxes; all4 readback SHA256s matched:
owner-return `d3b5935075d03c4bdf528953cb7aa618103304b4a859fd8bef1906039502dbf1`,
normal receipt `c121b4f5de653ce5c0e66b2286633db77424176d390669f16e1f998d92851a48`.
Delivery is not a source-commissioning ACK. Source remains OFF; Manager trust,
financial producer mapping, approved numeric/calibration, coexistence/G2 and
browser remain open. No ELP2-11, remote push or stable/dev/main action.

**Verification: R0.** Independent source review by root and two read-only
agents; arithmetic width check only, no new test/build cell or duplicated
gate. Requested regressions are pending, not predeclared PASS.
