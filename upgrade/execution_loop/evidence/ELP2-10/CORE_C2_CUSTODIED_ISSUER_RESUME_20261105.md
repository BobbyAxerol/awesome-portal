# C2 issuer → custody and same-original restart — 2026-11-05

**SOURCE-ONLY; NOT COMMISSIONED, NOT A2, NOT RESTORE CUTOVER.** Core branch
`docs/research-loop-plan`, base `2faa8968fddbde59b2e59525e334ba3d83886144`
plus the existing uncommitted shared WIP. No production migration, listener,
runtime, registration, session or grant was installed or changed.

The C2 issuer now signs the candidate assertion before lease commit and stores
its digest, never the bearer. The source-only upgrade adds a nullable digest:
historical NULL remains unproven, with no invented backfill. An exact original
can be reconstructed after restart from the original lease ID or exact request
bytes only while owner/session, workspace, registration, revision, source and
key pins remain current; reconstructed signed bytes must match the stored
digest. A different request/key/owner, changed authority or retired original
does not mint a replacement.

`C2CustodiedIssuerCandidate` is an explicit **unmounted** composition. It
returns a bearer only after independent custody accepts the same original and
the issuer revalidates it. The lease ID is the stable custody operation ID;
after an ambiguous commit the same original and operation are resumed, rather
than minting another. Its pending error contains the lease ID, not the bearer.
The independent store additionally checks the source's exact assertion digest.

## Test evidence

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **18/18 pass** on
  disposable PG, including exact restart, wrong request/owner/key, revoke via
  drain, same-original fence and legacy NULL upgrade. The initial run was
  **17/18**: the new test tried direct session revoke without the required
  drain. The test was corrected to exercise the existing drain rule and rerun.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **4/4 pass** on two
  disposable PG clusters, including real candidate issuer → custody, lost
  commit response, restart with the exact request and one original, custody
  offline, revocation between custody and return, chain/lock negatives. Earlier
  development runs failed due to a test count not scoped to its custody and a
  test registration left at the previous authority revision; the final test
  scopes its query and creates a distinct test-only registration at the new
  revision. No proof here represents actual owner consent or Edge ACK.
- A focused semantic `tsc` invocation with strict checking, 1,024 MiB Node
  old-space and the repository-compatible `esModuleInterop` and
  `experimentalDecorators` flags exited 0 for the wrapper and transitive
  imports. The first invocation omitted those flags and exited 2 on unrelated
  argon/decorator configuration diagnostics. This is not the full project
  typecheck or normal hook.
- Isolated containers/networks were removed by the runners; a read-only
  container inventory found none of their named cells. Root disk 56% used.

Current SHA-256:

| Input | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `8b379f7857f6ece6cd689e95fa982aa9ba59d5ed0e08e957927c94c6c9ad501f` |
| `current-human-candidate.sql` | `dfc4db25b3bac05b7bc3bb11c1618b2d4848aabad25405a0eeb8ada1b3a975d3` |
| `c2-human-issuer-upgrade-candidate.sql` | `98cae57a5d8bb41278c115c998439ce353f9a2d3d0e599f6a26f9a20a6fff180` |
| `restore-independent-custody-candidate.ts` | `f470face39aeac3da6e4283f3bb7fbc8001608381003fc8a1e7fb1df5f312b8c` |
| `c2-custodied-issuer-candidate.ts` | `ba7472b1537bcaad294ceca38a38888853118e6803d24ef24924d87be8cb4411` |
| `c2-owner-issuer-pg.spec.ts` | `4d5ae21a635107a2625046edb1f65807f7e4eaa98d39dbb91a81dcc9cf76fce2` |
| `restore-independent-custody-candidate-pg.spec.ts` | `fac1186c92241efa5e606a275809a169b5f973597f46a624a5bf6de20add8fe0` |

## Remaining, not implied by this result

- The raw internal issuer remains accessible in source; the candidate wrapper
  is not wired as the exclusive runtime entrypoint, and no native HTTP custody
  holds the final authorization through actual delivery. Source ENTER still
  needs its independent last authorization. Shared-source and independent DB
  commits are not a distributed atomic transaction. The independent cluster is
  not yet qualified as a separate failure domain or least-privilege deployment.
- The chain lacks externally qualified immutable checkpoint/writer fencing,
  complete post-snapshot source terminal and recipient ACK readback, restore
  reconciliation and cutover/rollback proof. An isolated synthetic terminal is
  not an Edge ACK. Legacy DR remains fail-closed.
- Full A2 still requires actual P7 owner acceptance, source registration,
  listener and P8 authority/runtime pins; the delivered static trust is only a
  public candidate. `C2_SEALED` was relayed, but B2 remains unsigned until A2
  acceptance and the other conditions are genuinely met. No frontend change.
- Full candidate review, integrated typecheck/normal hook, safe landing and
  connected acceptance remain open. No push, dev/main/stable or Live change.
