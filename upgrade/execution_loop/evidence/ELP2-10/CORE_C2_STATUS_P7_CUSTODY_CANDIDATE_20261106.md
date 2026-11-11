# C2 STATUS P7/custody candidate — 2026-11-06

**SOURCE/TEST WIP ONLY, UNMOUNTED.** No source has been commissioned, no
real Edge response or ACK was produced, and this is not ELP2-07/10/11 PASS.
Committed baseline `2faa8968fddbde59b2e59525e334ba3d83886144`; the shared
worktree is not a frozen integration candidate.

## Change

The generic `issueCommandStatus` remains refused for a C2-selected signer.
There is now a separate internal STATUS-only path: it accepts only the exact
PM STATUS POST path and no query, snapshots request bytes before awaiting,
requires the pinned owner/P7/custody combination, atomically links the
assertion to the STATUS context and original in the existing Core transaction,
and retains the exact assertion in the separately selected custody before
returning it. It rechecks current owner/P7 and the exact link afterwards.

The matching retry requires the same lease, request, complete context link
and assertion digest; a generic C2 resume refuses a STATUS-linked original.
Revalidation checks the same exact link and its expiry. An ambiguous custody
append stays pending under the existing lease ID; retry must retain that same
original. The wrapper exposes issue/resume/revalidate as internal candidate
methods only. No method creates an Edge ACK or starts a source transaction.

This does **not** mount the candidate or replace the independently
authenticated `CommandSourceAssertionAuthority`. Caller-supplied link fields
alone are not an authenticated original, authorization or recipient. The
existing C2 composition/bootstrap remains hard-fenced. A future adapter must
wire the STATUS authority's exact request bytes and verified context through
these methods, preserve HTTP delivery custody, support the source terminal and
authenticated Edge ACK and test actual gateway recovery. The existing C2
same-request fence remains conservative, including after a terminal/ACK;
do not claim repeated STATUS polling is commissioned. P7 READ/HISTORY scope
is not permission to submit commands or enable Live.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: final stable-source
  **9/9 PASS** on disposable, separate Core/authority PostgreSQL clusters.
  The expanded case covers the STATUS-only path, exact P7/custody retention,
  wrong path, wrong context/receiver, generic-resume refusal, same-lease
  restart, duplicate-issuance refusal, absent synthetic ACK, ambiguous custody
  write and same-original recovery, and P7 revoke before revalidate/resume.
  Test identities, signatures and data are synthetic. Earlier passing runs
  occurred while test/wrapper edits were still being made and are not used as
  evidence for the final source.
- Strict source typecheck of `c2-custodied-issuer-candidate.ts` and its imports,
  using `--noEmit --strict --skipLibCheck --experimentalDecorators
  --emitDecoratorMetadata --esModuleInterop --module commonjs
  --moduleResolution node --target es2022` with a 768 MiB Node heap cap:
  exit 0. Test-inclusive/full-project typecheck and normal hook not run.
- `git diff --check`: exit 0 for tracked changes. Exact-name Docker container
  and network checks through the runner's daemon returned no remaining P7 test
  resources; earlier unprivileged Docker checks were denied. The script's
  declared aggregate limits are 2 CPU/1.5 GiB; peak consumption not measured.

## Pins and handoff

| WIP source | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `a2928a95afbca73b3aca910c215772cb54de46a4755200a379810d7fccbb886c` |
| `c2-custodied-issuer-candidate.ts` | `207f41214d66f477ef20548390122e43cbd9b7ff8e94a3a13daadeabbb771479` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `389530f7478a26a09e3891d7871781771c7d929e0b2abb897dcd3bdf24a13796` |

Core next: wire and test the actual STATUS authority/custody adapter including
recovered original, HTTP delivery and repeated sequence with authenticated
ACK; finish independent recovery/restore, integration review and gate. Edge
remains the sole upstream coordinator for qualified original/source and real
ACK. Claude has no new UI field or action from this WIP. Rollback before
installation is to leave it unmounted; retain all existing source and custody
records. No runtime, live DB, frontend, dev/main/stable, remote or command/Live
configuration was changed.
