# STATUS restored context coherence — 2026-11-06

**Source/test WIP only. No actual Edge ACK, complete recovery barrier, restore
authorization, runtime installation or ELP2-07/10/11 PASS is claimed.**
Checkout `docs/research-loop-plan` HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`.

## Finding and repair

The restored-context census already required contiguous delivery sequence,
matching previous lease, original/call/binding, requester, lease request and
synthetic ACK. It did not, however, check whether all links in the same
context had the same immutable context metadata. In a disposable PostgreSQL
test two links with valid individual leases and synthetic ACKs but different
context nonces incorrectly returned `unresolved=0` before the fix. This is a
restore/corruption counterexample, not a demonstrated production exploit.

The shared census now compares every link with the first link for context
nonce, authority fingerprint, STATUS token digest, STATUS request digest,
STATUS issue time, receiver, context expiry and PM request digest. Those
values are fixed for the writer's same original context. Any mismatch is
counted unresolved, including in the existing `consume` recheck under the
authority/ISSUE lock. A test also confirms that a drifted context cannot mark
the preparation consumed. The intact two-link case remains accepted.

These are **chain consistency checks only**: agreement among rows does not
authenticate a common fabricated value, prove all prior links survived, or
establish actual Edge delivery. External original/ACK completeness, source
authority, independent old-holder fencing and V2 restore remain separate.

## Tests, scope and cleanup

- Before the source fix the affected two-PG suite was **23/24**: the new
  drift case showed the false `unresolved=0`. After the census fix, the full
  selected three-file suite was **24/24**. A later extension tested actual
  `consume` refusal and reran the affected census file only: **7/7**. The eight
  drift variants are assertions within one test, not eight added test counts.
- `scripts/test-elp2-restore-checkpoint-pg.sh census` now selects that single
  PG test; no argument keeps the existing three-file behavior. Disposable
  clusters and node were bounded to 2 CPU / 1.5 GiB combined; actual peaks were
  not measured. No `elp2-ckpt` test containers remained in the post-run census.
- Focused strict TypeScript compilation of the census test and imports exited
  0. `git diff --check` passed for tracked paths. Neither is a normal hook or
  full candidate qualification.

| WIP input | SHA-256 |
| --- | --- |
| `command-status-ack-census.ts` | `9b02b785cee29fd5a406517441ee4bde8ef5b47eebdb50daeee9a9701befbaff` |
| `command-status-ack-census-pg.spec.ts` | `8b120042dae9a00f8f98f908da87c52dcb125fcc3b9a35c22e94128c6246deef` |
| `command-status-preparations.ts` | `86da77c528fc60ac17888c59378c5735d9e1c2c00333ac64d8fd75c64be287ee` |
| `command-source-assertion.ts` | `1f66f44215f9a50fac91ecb36512e64fab9e96a5e96c9bbf2aa89ffa140329f9` |
| `test-elp2-restore-checkpoint-pg.sh` | `45028c599dcd421f23ac9ff0d016feafbb536520e98d21fa5d26627b98c44a18` |

Continue with independently protected authority and complete source/ACK
census, candidate review, restore rehearsal and actual Edge STATUS on the same
original. No UI contract changes or frontend action. Rollback is to keep the
uninstalled candidate and existing V2 restore refusal; never manufacture or
discard an ACK to satisfy the census.
