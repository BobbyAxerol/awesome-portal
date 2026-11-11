# C2 integrated test typecheck — 2026-11-06

**LOCAL TYPECHECK AND AFFECTED RETAKES PASS; NOT AN INTEGRATION OR AUTHORITY PASS.** Core checkout is
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144` plus
shared tracked and untracked WIP. No shared runtime, frontend, Edge or persistent database was
changed. This is not the normal hook and does not commission P7 or recovery.

The first `npm run typecheck` completed with **exit 2**, not a timeout. The
first test-inclusive `tsc --noEmit` reported repeated `TS2345` request-method
widening errors in the P7/custody PG specs and `TS2339` for accessing
acceptance/delegation fields without narrowing a discriminated result. The
subsequent cross-loop command did not run. Some terminal output was truncated;
this receipt does not claim the shown errors were the entire diagnostic set.

The test-only correction preserves `POST` as a literal for the request
fixtures and adds an explicit fail-closed test assertion before accessing
the recorded P7 result. It does not cast away errors, alter production
semantics, bypass tests or remove the P7 issuer fence. An initial focused
typecheck still found a missed race fixture with the same literal-widening
issue; that fixture was corrected too. The complete `npm run typecheck` retake
exited **0**, including both the test-inclusive project and cross-loop project.

## Affected tests and cleanup

The isolated P7 owner-intent suite passed **9/9**; the separate independent
custody suite passed **5/5**; the checkpoint/upgrade/ACK census suite passed
**23/23**. The last suite does not include the custody spec; the two results are
distinct, not an end-to-end owner or Edge proof. Each used disposable PostgreSQL
containers and its own cleanup trap. Afterward a read-only Docker name check
found no containers matching `elp2-custody`, `elp2-ckpt` or `elp2-c2-p7`.
Free filesystem capacity was 269 GiB. No broad cleanup was performed.

Affected P7 test SHA-256: `350ce5e01a04f1ee5546531bf8bf3b0ade511d65f00c0004080a7ebdaa46d683`.
Affected independent custody test SHA-256: `ab6c4e1a17bcaeb2282e1c7d3c2f7303d82e4473585e91aba26854fd315d4c14`.
These test source hashes do not freeze the remaining transitive inputs.

The previous WIP inventory is now historical because the two test inputs
changed. Candidate review, full normal hook and
source/authority/connected acceptance remain open.
