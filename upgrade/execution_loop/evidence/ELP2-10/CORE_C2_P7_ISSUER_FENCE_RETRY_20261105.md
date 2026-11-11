# C2 P7 issuer fence and same-original contention retry — 2026-11-05

**SOURCE ONLY; issuer remains hard-fenced, P7 preparation is not an authorized
acceptance.** Branch `docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`. These source, test and candidate
schema changes are uncommitted; preserve all other WIP. No runtime, protected
database, source grant, token, B2 signature or frontend contract changed.

## What changed

The internal candidate can bind the retained source proof, cycle and original
owner intent to a P7 fence digest on a newly issued lease. At issue, same-lease
resume, and ENTER it checks the original record, owner/session, registered
source and workload, lock-protected revoke and validity periods. It checks
again after custody inspection; the lease cannot outlive the shortest source,
session or step-up validity. A guarded lease cannot be ENTERed by this code
with an omitted or different P7 fence. RESOLVE remains separate: an already
entered original can still settle with its authenticated source terminal.

Confirming the same reviewed request concurrently previously exposed a
partial result when one transaction encountered contention: an intermediate
two-PG run had **5/6 PASS**, not a passing suite. The review candidate now
retries only the explicit `ACCESS_RETRY_REQUIRED` and PostgreSQL lock,
serialization or deadlock codes, at most three times with bounded delays. It
revalidates the same original intent on every attempt; it never retries a
revocation/unknown error as success or creates another intent. Persistent
contention still returns the typed unconfirmed state.

## Checks on this local selection

- Focused P7/review/issuer/acceptance suites: **51/51 PASS**, including retry
  bounds, PostgreSQL lock refusal, same-intent calls and revoke after contention.
- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **6/6 PASS** on two disposable
  PostgreSQL clusters, including concurrent confirmation, lost response,
  revoke and original terminal settlement. Synthetic identity/proof only.
- Focused strict source TypeScript check: exit 0. This is not a whole-project
  typecheck or integration hook. `git diff --check`: exit 0.
- Runner used disposable containers and network; its EXIT trap removed them.
  No product image or persistent volume was changed.

## Pins

| File | SHA-256 |
| --- | --- |
| `c2-p7-review-candidate.service.ts` | `c18ebd1acab20e467cc5e11453394a659e57cbe7ea0c2b41f576f88ec72f3f4d` |
| `c2-p7-issuer-fence-candidate.ts` | `9548731be5c547d547051e48829523e84ad6c591d0e6c1c090ecaa2ad54a1498` |
| `c2-p7-review-candidate.spec.ts` | `a5f850c35f5a5000c9bb7f522ca835fd317c44f7e323a3b026f206b57efa8d71` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `3773c73ab4e37411bb1c4719daaf28c84ab24ef7796aaf6a6668f6562596ebef` |
| `test-elp2-c2-p7-pg.sh` | `a60988ddcc7caa9216314add37b963205a6a831578c35d5630955b60985b88f2` |

Revalidate transitive source/schema/test pins on a frozen integration tree;
the hashes above alone do not establish compatibility with another image.

## Remaining, explicitly not closed

The SQL transition does not independently enforce this P7 check against an
older holder or arbitrary privileged writer. Stop/fence old holders and prove
database role/ACL enforcement before rollout. The nullable candidate column
requires a reviewed forward migration; legacy rows are not P7-authorized.
HTTP response custody, genuine protected-owner source/acceptance, issuer and
listener commissioning, independent recovery barrier, A2 acceptance and B2
remain open. Do not mount this preparation as production authority, infer
connected PASS, or permit V2 restore. No Claude consumer action is required.
