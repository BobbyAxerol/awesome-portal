# C2 recovery: retained source-proof candidate — 2026-11-05

**SOURCE_ONLY, unmounted; A2 and recovery are NOT_READY.** This closes one
implementation gap in the independent custody candidate, not the restore gate.

## Change

Previously the independent journal retained source claims and proof hashes,
but not the actual signed source proofs. Once TS cleared its journal after an
ACK, a restored Core could not independently recheck those exact signatures.
The candidate now encrypts the authenticated ENTER, UNKNOWN and terminal proof
using AES-256-GCM under a separately supplied 32-byte key. The AAD binds the
custody, operation, generation, lease, event kind and hash. The encrypted proof
and event are committed in the same authority transaction. Human bearer tokens
are not retained in this vault. Issuer/terminal compositions require the vault,
and issuer preflight checks the candidate table, read/write privileges and its
append-only trigger. A failed proof insert aborts the terminal and withholds ACK.

The new bounded verification method reads the retained encrypted proof after
reconstructing the candidate, rechecks the pinned source signature and event
binding, and returns **metadata only**. Historical verification uses the signed
issuance time; it does not authorize a fresh request or replay. It deliberately
returns `VERIFIED_NOT_CUTOVER`.

## Focused evidence

- `npm test -- test/restore-c2-source-proof-vault.spec.ts test/c2-human-issuer-composition.spec.ts`:
  **17/17 PASS**, including wrong vault binding/key/tag and absence of vault.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** on two
  disposable PostgreSQL clusters. Includes failed proof write, loss/retry,
  revoke, UNKNOWN, terminal, duplicate ACK handling, restart reconstruction,
  signature and wrong-key rejection, and disabled-trigger refusal before
  original issuance. Containers/network were created and
  removed by the script; no persistent volumes.
- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **18/18 PASS** on
  the disposable two-cluster cell, with candidate issuer composition.
- Targeted strict TypeScript check for the vault and independent custody module:
  **exit 0**. This is not a full integration hook.

## Source pins (SHA-256; local WIP)

| File | SHA-256 |
| --- | --- |
| `restore-c2-source-proof-vault.ts` | `efb09cfcb8a62dc87ca5876d2b8a82fe92fc3875112bf5bffbd6e219ca8044ec` |
| `restore-independent-custody-candidate.ts` | `44463d40a9d965c8aada326f32fbc62ccd3abda0b3675f5c0c9dfab06e24dd45` |
| `restore-independent-custody-candidate.sql` | `a19edf394084b0e424fb6c4e28e80e27532e3438f453be346b64c89d77e01862` |
| `c2-custodied-issuer-candidate.ts` | `eddbc17f8909c3d7eb1f78271bd64a16982a5754eb7484adf33c4ad28874a31e` |
| `c2-custodied-terminal-candidate.ts` | `eb442a6823ff032989a45f15a6142ac7fb94c241345c6cc06bbe090b652d46bf` |
| `restore-independent-custody-candidate-pg.spec.ts` | `4172a11b7ecf6b77d44a2545657593e04b762c93bcae46452560b327694e926d` |
| `restore-c2-source-proof-vault.spec.ts` | `63569e3133791b704b0e7d6f5268afbc88575573f5fef82b7a4979f0230a4281` |

## Still required

An independently commissioned and recoverable key, actual separate authority
failure domain/ACL, external checkpoint and old-holder fencing, complete
post-snapshot source/recipient ACK census, and a restore/cutover rehearsal are
not established. Authentication of a stored proof is not proof that any
recipient received an ACK. The schema and code are not installed. No source
receipt, authenticated P7 acceptance or A2 runtime is claimed.

TS verified the existing static bundle structurally; reuse its exact bytes.
Full A2 still requires asks 1–9 in
`EDGE_RELAY_TS_STATIC_VERIFICATION_ASKS_20261105.md`, including an installed
issuer/listener/source binding, genuine P7, installed P8 and O-1–O-4. B2 remains
unsigned until actual A2 acceptance as well as the other release conditions.
No command/Live activation, remote push or frontend change occurred.
