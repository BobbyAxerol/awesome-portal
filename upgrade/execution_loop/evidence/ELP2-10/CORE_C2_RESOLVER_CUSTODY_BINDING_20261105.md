# C2 ENTER and terminal custody binding — 2026-11-05

**SOURCE_ONLY; NOT COMMISSIONED.** Base
`2faa8968fddbde59b2e59525e334ba3d83886144`, branch
`docs/research-loop-plan` plus shared uncommitted WIP. No runtime, real source,
credential, database, authority, command or Live state was changed.

The generic candidate entry and resolution paths formerly accepted C2 originals
without requiring the independently retained original or terminal. They now
refuse such calls under the locked lease row. The C2 coordinator uses explicit
custody-aware entry and resolution: entry checks the exact original proof hash;
resolution checks that the journal contains exactly one semantically matching
UNKNOWN/terminal for the same lease. A renewed source envelope can differ in
token ID and validity timestamps but not in its source, attempt or receipt.
ENTER must still be journaled by the coordinator before an ACK is emitted.
Legacy rows explicitly marked with null assertion digest keep the legacy path;
null is not evidence that an original has been qualified as legacy.

## Verification

- `scripts/test-elp2-independent-custody-pg.sh`: final run exit 0, **4/4** on
  two disposable PostgreSQL clusters and test-only mTLS. It checks that direct
  C2 ENTER/resolve is refused, an unjournaled terminal cannot resolve, and
  same-original loss/retry, post-drain UNKNOWN/terminal and duplicate event
  handling continue to work. An earlier run failed because the injected
  lost-COMMIT counter hit the new inventory read; the injector was moved to
  the journal commit and the final run passed. This is not connected proof.
- Focused recovery/transport/composition suite: **39/39**; focused strict
  TypeScript check exited 0. A separate candidate suite reported **110
  skipped**, not PASS; it needs its dedicated PostgreSQL environment on the
  integrated candidate. The normal hook was not run.

| Input | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `5fcc10b4520bb0c8f3614c972a24bb9747829ede9ac7b0b2cd1c76103004e990` |
| `c2-custodied-terminal-candidate.ts` | `cd87a1b88bb77bc09755182b7a44ddf368aef7a8d879f0457d34ee467fe00dd3` |
| `restore-independent-custody-candidate-pg.spec.ts` | `b372db657207af4e2dbd196d5f551fb118d8805cfbb803a1e2989208475785ed` |

Hashes supersede matching prior receipts. The candidate and its exact custody
configuration are not mounted or independently qualified; app-level access to
custody methods, database ACL and immutable original bindings require review
before commissioning. Independent checkpoint, old-holder/HTTP fence, source
terminal/ACK census and restore cutover remain open. Genuine P7 and connected
A2 remain open; B2 is unsigned. No normal hook, landing or push is claimed.
