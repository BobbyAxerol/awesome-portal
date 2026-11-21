# Registration family — independent final source review

Status: **ACCEPT_WITH_LIMITS — SOURCE_ONLY / NOT_APPLIED / NOT_RUN**.

Review recorded on 2026-10-18; final inspected private-file hashes captured at
12:06:07 UTC. This reviews the proposed local registration family, not an
authenticated PM result, installed provider, executed migration, generated
artifact, test receipt, consumer acceptance or original07/08 closeout. No
canonical file, Git ref/index, runtime, process, source service or database was
changed or exercised by this review. Main owns integration after its current
normal hook is terminal; that hook's outcome was not inspected or inferred.

## Conclusion

**No additional concrete code/plumbing correctness blocker found in the inspected
draft.** In particular, the formerly incompatible locked-context check is now
correctly separated from detached read-context lease checks. The current source
supports proceeding to Main's one coherent integration and actual validation;
this is not permission to commission a provider or widen source authority.

## Reviewed seams and findings

Locators below are relative to this private directory unless explicitly marked
canonical. They refer to the file hashes in the final section.

1. **Real positive intake and locked authorization:**
   `instance-registration.service.ts:29–67,114–138,182–205` and canonical
   `apps/control-api/src/execution-v2/access.service.ts:125–235`.
   `commandBoundary` owns the current locked session, step-up, complete Core
   fingerprint, workspace fence and its commit-time rechecks. Its transaction
   context intentionally does not contain the detached read lease fields.
   The draft now uses `registerGrantDecision` plus exact selected registration
   authorization in that callback, rather than calling detached
   `mutationFingerprint` there. It retains complete policy/DENY/delegation
   evaluation and requires the selected receipt to correspond to the real
   `deployment.register` grant, Portfolio and environment; audit permission
   cannot be substituted. No source await spans the Core transaction.

2. **Current state survives awaits and errors:**
   `instance-registration.service.ts:48–112,221–238` and canonical
   `execution-v2/read-scope.ts:207–237`.
   Prepare carries the original detached fingerprint instead of re-evaluating
   an expired captured lease. Fresh source/Core contexts renew genuine current
   authority, compare the complete stable fingerprint and retain actor,
   grant/delegation/native effective-time and selected authorization deadlines.
   Held success/error responses are fenced too. The final source send does not
   reinterpret a local admission check as source ENTER/COMMIT authority.

3. **Same key, concurrency and ambiguous local COMMIT:**
   `instance-registration.service.ts:161–219`,
   `instance-registration.store.ts:93–180`.
   Actor and exact intent hash are checked before decoding a key collision.
   The second locked lookup returns an existing obligation unchanged; it does
   not replace its proof or claim another request's PREPARED/SENDING row.
   Durable command, attempt, event and audit precede source I/O. A lost local
   claim-COMMIT acknowledgement cannot trigger a send: only that exact possibly
   committed attempt is best-effort marked UNKNOWN, then the request fails.
   Update attempt correlation prevents clearing another sender's attempt.

4. **Source generation, byte correlation and monotone receipt:**
   `instance-registration.contract.ts:8–16,61–95`,
   `instance-registration.trust.ts:22–117,133–214`.
   Strict ingress preserves complete text/UTF-8 and exact decimal counters;
   no trimming or surrogate repair changes identity. Source request/response
   byte digests, intent, selected source and stage are correlated. PREVIEW
   rollback is not APPLY. APPLIED requires the source generation/receipt
   version **1**, verified commit/lookup terminal and a namespaced owning
   receipt; its key is not incorrectly required to equal the client key.
   UNKNOWN cannot erase APPLIED, and a conflicting APPLIED business receipt is
   rejected. Opaque source instance identity does not create a canonical
   account/deployment pair or funding/activation/native fact. The provider port
   remains unqualified by default; TEST_ONLY frames only test correlation.

5. **Independent current audit and retained GET:**
   `instance-registration.service.ts:254–299`, `wiring.patch`, canonical
   `operations/current-operational-read.ts`,
   `execution-v2/current-audit-read.ts`, `facade/session.guard.ts` and
   `execution/retained-read-profile.ts:25`.
   The existing SAME current-read flight qualifies the exact bounded raw target
   before protected status decode, then refreshes source and performs LAST
   Core for body/error disclosure. Historical send TTL/author is not current
   read authority. Reconcile requires current audit but recovery is separately
   service-only, same-key lookup: no stale human cookie or resend. The proposed
   retained exception is only this exact family GET path; SessionGuard still
   blocks preview/submit/reconcile POSTs in retained review.

6. **Capacity, timeouts and durable retention:**
   `instance-registration.store.ts:97–124`,
   `instance-registration.service.ts:300–314`.
   Existing-key lookup precedes new-key capacity rejection; pending/total caps
   do not evict accepted or UNKNOWN obligations. Four outstanding provider
   calls are bounded by response timeout/abort. A provider ignoring abort
   retains its slot until its actual promise settles, so the timeout does not
   permit unlimited background calls. Runtime retention/custody remains a
   commissioning obligation, not a claim that local caps solve long-term
   storage.

7. **Migration and public/HTTP plumbing:**
   `1723680000143_execution-instance-registration.sql:5–95`,
   `instance-registration.controller.ts:1–73`,
   `generate-execution-instance-registration.mjs:1–184`, `wiring.patch`.
   The family remains a separate Core metadata ledger with immutable original
   tuple/APPLIED receipt, append-only events, bounded JSON, attempt/chronology
   checks and no capital discriminator widening. Down deliberately preserves
   obligations/history; rollback here means removing new mounts/sends, **not**
   an exercised SQL Down/Up or proof of schema replay. Four routes, methods,
   finite schemas, safe CommandProblem envelope, no-store/session handling,
   Origin/double-CSRF and key correlation agree at source level. The structural
   `Pick` generalization is sufficient; no fake capital intent cast is needed.

## Test definitions reviewed, not results

The private pure, schema and PG/HTTP tests remain **NOT_RUN**. The latest PG
fixture independently supplies current register versus audit native relations
and accepted membership, rather than sharing a legacy singleton. The added
wrong-selected-action case and audit-native-leg loss after raw load distinguish
the two authorities (`elp207-instance-registration-transaction.spec.ts:65–205,
353–370`). Existing pending-cap/no-eviction and abort-ignoring-provider cases
exercise the intended real store and bounded service, not elapsed-clock
substitutions. Main owns these tests and any changes; this review added none.

## Limits and exact remaining integration gates

- Main must apply the proposed source alias, structural membership type,
  controller/DI/default-dark provider, exact retained GET exception, generator
  chain, test table order and route/persistence inventories as one compatible
  package; reserve migration143 against the actual landing tree.
- Generate the finite OpenAPI/client/fixtures through the existing chain and
  run the actual pure/contract/PG/HTTP gates. Source inspection cannot prove
  TypeScript resolution, migration execution, hook success or runtime parity.
- JSON Schema explicitly does not encode every Zod/runtime refinement
  (well-formed UTF-16/UTF-8 and cross-field chronological comparisons). Finite
  literals, object strictness, int64 lexical bound and the declared preview/
  business-state constraints are represented; runtime remains authoritative
  for the documented additional checks. Do not label this full refinement
  equivalence or remove the stricter Zod guards to make a fixture pass.
- Authenticated selected PM transport, genuine rollback/held human/workload
  COMMIT, actual source receipt recovery, custody/retention and runtime
  qualification are still separate gates. Source pins and synthetic TEST_ONLY
  frames are not those gates. Shared preview stays dark; capital family and
  source economic/activation authority remain unchanged.

## Final inspected private hashes

```text
54a106864094e57bb1ec0f9a20d7726c8f2a9fd6d848d33f0724e93b2fb7dd51  instance-registration.contract.ts
731a46e659a83c34c53207f1c338217d614299b93d0b37f488de70e62a9e0e35  instance-registration.controller.ts
8d3949bfc05dce070b53c6b292c600b15cb01b9c80d9ce478dff6e2308c4e200  instance-registration.trust.ts
ed094144f117039cd7e49225b742707b1fb8c0b86663a63e6b4abc842744712e  instance-registration.store.ts
45542eb122ba1fc744e08aa8d5cfeb0a9903b612318f09a2286bfccc30d76458  instance-registration.service.ts
a4b6a0e83b1048e735ede59865aeaeea19cf93b113e23f477ab87717798c75e7  1723680000143_execution-instance-registration.sql
622967e9b3b96d7fc867ea1fb62c55a3664543a989b5c1d1f90c70f8d322f22f  generate-execution-instance-registration.mjs
ed79d545d5d1c4318e34e4cfb64afe980398f1eec2021788485c4389b5ccf1e0  wiring.patch
9f96ea60834f2048f21568d2ce3f815cbbc4a55f0a606bf89bd3c510b1bf3f91  elp207-instance-registration-transaction.spec.ts
ccf4840b2eac96197d3a338c57eb288ae2cb60d1fca701eed6d452cc905984a3  execution-instance-registration.spec.ts
a820b2d6e053736d1642fc0c129dc3a066bbc1b75006b88c592047c817cdd4e8  elp207-instance-registration-trust.spec.ts
```

PM semantic source pin supplied in the task map:
`6f3c852bd61fcc45d7aadacafe2776cbbb0059b7`; later compatible source metadata
observation supplied by Main: `5cdc982921e1499345e5b01ac79f1dd90529b8c3`.
This reviewer made no new remote observation and does not promote either pin
to deployed or runtime-qualified status.
