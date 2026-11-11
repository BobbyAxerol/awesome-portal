# C2 custody before terminal acknowledgement — 2026-11-05

**SOURCE_ONLY; NOT INSTALLED, NOT A2 OR RECOVERY CUTOVER.** Research branch
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus shared uncommitted WIP. No runtime/service, credential, grant, source,
production database, command or Live state was changed.

## Change and invariants

- Added an unmounted C2 terminal coordinator. It uses the exact Core pool and
  candidate with the independently configured custody, authenticates and
  records the exact original/terminal before calling Core `resolve`, and does
  not return success after an ambiguous custody commit. Its operation ID is
  deterministically scoped to the original lease, so retry does not create a
  second terminal event. Different terminal/receipt content is rejected.
- A freshly signed source envelope with the same original, terminal and
  receipt may renew an expired proof after restart. Only `jti` and validity
  times can differ; signature/pin, current validity and every semantic binding
  are checked. This does not alter the original custody event or its proof
  hash. Exact-byte replay remains possible under the existing rules.
- The C2 issuer composition now requires a custody instance on the same Core
  pool to construct its unbound mTLS reverse listener, and routes its RESOLVE
  through the coordinator. The unrelated generic current-human transport still
  exists for non-C2 consumers; it is **not** an approved C2 runtime entrypoint.
  `UNKNOWN` continues through the existing authenticated Core quarantine; it
  is **not** independently journaled here and is not a recovery barrier.

## Tests and pins

- `bash scripts/test-elp2-independent-custody-pg.sh`: exit 0, **4/4** on two
  disposable PostgreSQL clusters plus test-only real loopback mTLS. Tested
  ENTER before drain/revoke; source terminal then custody commit response loss
  yields HTTP 503 and leaves the same Core original ENTERED. A signed proof
  with a changed receipt remains 503; a refreshed proof for the same terminal
  gives HTTP 200, the retry gives the same terminal with `replayed: true`, and
  exactly one independent terminal event exists. This proves the isolated
  candidate behavior only, not an Edge/TS source ACK or real owner authority.
- `npm test -- test/c2-human-issuer-composition.spec.ts
  test/elp210-current-human-transport.spec.ts`: **33/33**, exit 0, loopback
  escalation with test-only certificates. The first local invocation supplied
  duplicate worker flags and did not execute tests; a further sandboxed attempt
  lacked loopback permission (`EPERM`). The successful retake is the result
  counted here. Missing custody is rejected at composition; trust mismatch
  checks and non-C2 transport regressions remain covered.
- Focused strict TypeScript check of C2 issuer composition and its imports
  exited 0. This is not the full project typecheck or normal hook. Runner
  cleanup completed; no `elp2-custody-*` test containers remained.

| Input | SHA-256 |
| --- | --- |
| `c2-custodied-terminal-candidate.ts` | `d8e29320745d89fea5c315f1cad08f6733494369116c33f72ed7c6306ade2b10` |
| `c2-human-issuer-composition.ts` | `0d207f7e8d447b3b9da75a176a7bdc4fdb01349441457d3719eeba3cd1fad01c` |
| `current-human-transport.ts` | `15e5f4a90ddf76822f8fb63a0e7f60235f45c9280b30e690bdf036c6147cead6` |
| `restore-independent-custody-candidate.ts` | `2d9d7259072900a046468992a3076cb7aef22e889e49f040312099ea59144eeb` |
| `restore-independent-custody-candidate-pg.spec.ts` | `7059178b2037ce9491eab3bf040fe5e9575e657cddf6828c67ebf5f430e0bb78` |
| `c2-human-issuer-composition.spec.ts` | `845cddb08e804c31afb9697dc6a1dca9913548b5e63aa4766a011a3b3c2867a4` |

These supersede matching source/test pins in earlier custody receipts.

## Remaining

P7 acceptance/delegation, qualified source registration and its revocation
fence, actual mTLS listener, P8 signer and full A2 are still absent. The issue
path is not yet the exclusive commissioned path, and holding human authority
until actual assertion delivery is not proved. Custody remains an unqualified
separate cluster, not an immutable authority/failure domain or old-holder
fence; UNKNOWN, complete post-snapshot census, actual downstream ACK, restore
reconciliation and cutover still need proof. B2 remains unsigned until genuine
A2 acceptance. Final integrated review, normal hook and safe landing remain
open. Do not mistake a signed fixture for an owner decision or Edge receipt.
