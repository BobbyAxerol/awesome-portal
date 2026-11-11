# C2 same-entered-original proof retention — 2026-11-05

**SOURCE ONLY; UNMOUNTED; NOT AN ENTRY ACK OR RESTORE PERMIT.** Working tree
on `docs/research-loop-plan`, committed base `2faa8968f`; no runtime, schema,
source authority or production data has been changed.

## Candidate

If Core has committed one-shot ENTER and independent custody fails before or
after its commit response, a second ENTER remains forbidden. The unmounted
`C2CustodiedTerminalCandidate.retainEnteredProof` gives an internal recovery
caller a way to retain or replay the signed source ENTER proof for **that
already-entered original**. It derives the existing deterministic operation ID
and calls the bounded same-original custody writer; it does not call ENTER,
mint another attempt, return an entry ACK, start source work or make a cutover
decision. Its only success state is `RETAINED_NOT_ENTRY_ACK`.

The underlying custody check verifies the pinned signature and source trust,
and holds the Core original under a row lock while checking exact lease,
attempt, workspace, environment, workload, request and custody binding. A new
append requires an unexpired proof. An exact already-retained proof may be
rechecked after expiry; a changed attempt, signature or phase is refused.
No endpoint or production recovery coordinator invokes this new method yet.
Obtaining a source proof independently and completing source settlement/ACK
remain separate gates; no ACK or permission to resume work is implied.

## Evidence

`bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, exit 0,
on two disposable PostgreSQL clusters with synthetic source and mTLS. The
combined test checks loss after a successful custody commit, a proof-write
failure before custody commit, the original still ENTERED exactly once,
refusal of wrong attempt, forged signature and wrong phase, then same-original
retention and replay producing exactly one custody ENTER event. It also retains
the earlier bounded-contention and failure cases. The first post-change run
passed; after adding the three negative checks this final suite was rerun and
passed. Containers were removed by the test runner; no connected Edge evidence
or full restore is claimed.

A strict targeted `tsc --noEmit` including the source and the PostgreSQL test
was stopped after approximately three minutes when its process RSS exceeded
1.5 GiB; it exited 130 and is **not PASS**. A retake of the changed source
only, with Node's old-space limit set to 1024 MiB and a 120-second timeout,
exited 0; this is not the full project or test-inclusive check. `git diff
--check` and the execution tracking reconciliation passed. No normal hook
was run.

| Current input | SHA-256 |
| --- | --- |
| `c2-custodied-terminal-candidate.ts` | `e5654b26783350aa16a6e633f6cbd1140ac7603b32dc7299acb4b4a92b20e948` |
| `c2-custody-append-contention.ts` | `bf970125df62870c164280274a495ecae5477c1924b0f7f4a307e01b3b78f25b` |
| `restore-independent-custody-candidate.ts` | `30bd2451eb64c965fc80d772b084bd2377f366b2f34f6d76a489a6b41a09986c` |
| `restore-independent-custody-candidate-pg.spec.ts` | `84b779ac5be2ccadc9a7fe28190e685fd713f8fc989a9f720585abe7fb8cfad1` |

The current terminal and test hashes supersede the corresponding selection in
`CORE_C2_CUSTODY_CONTENTION_RETRY_20261105.md`; its other impact analysis is not
an automatic receipt for this selection.

## Next

Complete independent owner and checkpoint authority, old-holder and HTTP
fencing, durable source proof discovery and complete post-snapshot terminal/ACK
census, then representative restore and final candidate integration. P7, A2,
B2 prerequisites, connected READ/STREAM and final qualification remain open.
This change creates no frontend contract or consumer action.

## Follow-up: source-only drain coordinator integration

The unmounted `CoreRestoreQuiescence.retainEnteredOriginal` now routes only a
proof naming the requested ENTER lease and attempt, checks the committed drain
and configured source/workspace original, calls the pinned custody method,
then checks the drain again. It returns `RETAINED_NOT_ENTRY_ACK` with
`CORE_ONLY_NO_CUTOVER`; if the drain changes during retention, the retained
proof remains but the call fails and the same original must be reconciled.
These checks are not an atomic old-holder/source/HTTP fence. The coordinator
still needs the real signed source proof supplied independently: the current
recover-ACK wire publishes phase and acknowledgement, not that proof. There is
no new endpoint, mounted service, source command, or caller-authorized ACK.

Both entry retention and the existing terminal reconciliation now invoke a
captured drain-status implementation, so an instance property cannot replace
the check. This is an in-process composition hardening, not protection against
a compromised process or privileged database actor.

- `bash scripts/test-elp2-independent-custody-pg.sh`: final **5/5 PASS**,
  exit 0. It recovers the missing proof after drain, checks replay, wrong
  attempt and drain, absent custody, fake per-instance drain status and one
  original ENTER event; the unrelated terminal branch also rejects fake drain
  status. The source, identities and keys are synthetic.
- `bash scripts/test-elp2-restore-inventory-rls.sh restore-original`: final
  **8/8 PASS**, exit 0, after the drain-check change; disposable PostgreSQL
  and unit regressions, not Edge or restore acceptance.
- Strict source-only `tsc --noEmit` for both changed coordinator/terminal
  sources, under a 1024 MiB Node old-space limit and 120-second timeout:
  **exit 0**. This is not the project-wide or test-inclusive check.
- Current `restore-core-quiescence.ts` SHA-256
  `bd2cc0f097bff0af151d132f717698f94409f1759cb1c5ff1d7f7397f1de6254`;
  `restore-independent-custody-candidate-pg.spec.ts` SHA-256
  `2134e8af876e1542976e0c0d9c791b7c3128ec89deeae10ae87b8e4717edd2b9`.
  These supersede the earlier test hash above; other transitive pins must also
  match before reusing any receipt. Full hook remains open.
