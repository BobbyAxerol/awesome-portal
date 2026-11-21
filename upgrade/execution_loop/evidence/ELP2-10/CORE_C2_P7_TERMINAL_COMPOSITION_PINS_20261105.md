# C2 P7 and terminal composition pins — 2026-11-05

**SOURCE ONLY, uncommitted candidate. P7 is not authorized, the issuer remains
closed, and V2 recovery/cutover is not qualified.** Branch
`docs/research-loop-plan`, committed base `2faa8968fddbde59b2e59525e334ba3d83886144`;
the working tree includes other existing work and is not a final candidate.

## Change and scope

`C2P7ReviewCandidateService` previously stored its pool, source verifier,
owner-intent writer, registration writer, preparation-record writer, pinned
bytes and feature/workspace settings in TypeScript `private` properties.
Those are mutable properties at runtime. The emergency service had the same
issue. The candidate now retains those selections in ECMAScript private
fields, and internal recovery calls use private implementations so replacing
the public resume methods cannot invent the answer to an ambiguous commit.
Synthetic tests try to shadow the old properties and resume methods, check
the original owner/session workflow, and show that the dark switch stays dark.

The source-proof terminal coordinator now also retains its validated Core
candidate and independent-custody object in ECMAScript private fields. The
two-PostgreSQL mTLS test shadows both old properties after constructing the
transport; ENTER and RESOLVE still use the selected objects and retain proof.
This hardens composition against accidental or hostile same-process property
replacement; it does **not** protect against a compromised process, mutable
dependencies themselves, privileged database administrators, or a source
outside the tested profile.

No production contract, migration, UI, grant, source, issuer, listener, or
runtime changed. No actual owner acceptance, delegation, source ACK, A2 or B2
was created. In particular, the independent old-holder fence, complete source
terminal/ACK census, same-fence real P7/issuer, restore rehearsal and actual
Edge acceptance remain open.

## Focused verification

- P7 review/controller/composition/AppModule: **38/38** tests passed using
  `npm test -- test/c2-p7-review-candidate.spec.ts
  test/c2-p7-review-candidate-composition.spec.ts
  test/c2-p7-review-candidate-http.spec.ts test/c2-p7-app-module.spec.ts`.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **5/5 PASS**, on a
  disposable PG, public pinned B1 and synthetic owner/source. Includes actual
  locks, HTTP session/CSRF, and the selected-objects shadow check. An earlier
  run overlapped a source edit, so **only the subsequent retake** counts for
  the current service bytes below.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, two
  disposable PGs and local test mTLS, including retry/settlement. The first
  attempt to execute this non-executable script directly returned 126 and did
  not start a test; the explicit `bash` invocation is the result above.
- The isolated scripts removed their named containers/networks; a read-only
  Docker check found none with the test prefixes. `git diff --check` passed
  for tracked files; untracked source is not covered. Full semantic typecheck
  and normal hook remain open, and are not implied by the above tests.
- `bash scripts/execution-tracking-test.sh`: exit 0; execution tracking
  reconciliation passed after the Unified and sync links were added.

| Local working input | SHA-256 |
| --- | --- |
| `c2-p7-review-candidate.service.ts` | `c62e8aa164fd5cb0736a4960735a00b2af299eab024b665a9b16b06dd5db0f82` |
| `c2-p7-review-candidate.spec.ts` | `9095a883c3c978876a8f07056392e170d11fc627476c08cc516d73a5ee9483d8` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `8bae243d1071bfecbd062f5854d8314fc77f162d52bb69bd01a45d419c9ebbbe` |
| `c2-custodied-terminal-candidate.ts` | `4e1a5343a9dcb28fa7a7735c9ad60feaed57fc09ff2ad1a98ab64a8314590159` |
| `restore-independent-custody-candidate-pg.spec.ts` | `90734a0bbb09437e97c99fb07f7fc1b7371f6339c922b62cf3fe37662b002516` |

Backend next: complete genuine P7/issuer same-fence composition and recovery
authority/fencing rather than activating the unqualified candidate. Claude:
no new frontend contract; fixture work may continue independently. Edge: no
new credential or input requested by this local change; connected evidence
is still separate. Hook runs once on the reviewed final candidate, not for
this intermediate WIP.
