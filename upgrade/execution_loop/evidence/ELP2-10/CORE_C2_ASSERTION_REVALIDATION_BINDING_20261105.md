# C2 signed assertion / lease binding at revalidation — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** Checkout `docs/research-loop-plan` at
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`. Code, tests and
receipt are uncommitted. No runtime, Research DB role, source or frontend was
changed; the issuer remains unmounted/fail-closed.

## Defect and repair

The unmounted C2 post-issue revalidator checked the stored lease and authority
but did not itself verify that its supplied token was signed or belonged to
that lease. A copied DB row could therefore make this **internal check** accept
the original token with another lease ID. This observation does not claim a
public exploit: the candidate is unmounted, and separate custody/source
verification was not shown bypassed.

For C2, revalidation now snapshots the supplied result before asynchronous
work, verifies the Ed25519 signature and pinned issuer/audience/kid/type,
parses the exact 16 claims, ties the coordinates, request and times to the
captured result and stored lease, and compares the signed token's digest to
the stored assertion digest. Generic non-C2 behavior is unchanged. These
checks do not hold authority until HTTP delivery and do not authenticate an
Edge response or create source authority.

## Validation

- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **7/7** in two disposable PGs;
  a restricted test login clones a P7-bound row and revalidation rejects
  the original signed token paired with the different lease ID; resume also
  rejects the reconstructed assertion. Synthetic row is retired, not deleted.
- `scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **19/19** in a
  disposable PG; explicitly checks an unchanged original succeeds and an
  invalid signature fails, as well as existing revoke and recovery cases.
- Focused strict source check passed with `timeout 90s ./node_modules/.bin/tsc
  --noEmit --strict --skipLibCheck --experimentalDecorators
  --emitDecoratorMetadata --esModuleInterop --module commonjs --target es2022
  --moduleResolution node src/execution-v2/current-human-candidate.ts`.
  The first focused invocation omitted the decorator options and exited 2
  with TS1206 in imported decorated repositories; it was not counted as PASS.
  Neither run is a full-project typecheck or integration hook.
- `git diff --check` passed; test runner traps removed their disposable cells.

| File | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `68a96f1cd7c087d36c36b73578fd1ff67cc32bde4935c9764896ba179d368634` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `bfb635d1fcd18cae511d254b17e951989c02519ec8542bb0caba60db2027e2f1` |
| `c2-owner-issuer-pg.spec.ts` | `664228009b0da04c5595c00c463f2a53571946ccc768808e79b32fb37a5219e7` |

## Open

This does not stop an authorized DB login from inserting fake rows or filling
capacity; issuer DB authority and signer isolation still require review. The
post-transaction HTTP custody race, genuine owner/source acceptance,
old-holder fencing, full recovery and ACK, integration migration and connected
qualification remain open. A2 is not complete and B2 is not signed. No new
frontend contract or action.
