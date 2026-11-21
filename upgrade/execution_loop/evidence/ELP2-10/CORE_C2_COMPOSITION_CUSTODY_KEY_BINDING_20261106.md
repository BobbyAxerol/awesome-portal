# C2 candidate — bind custody to actual issuer/source keys, 2026-11-06

**SOURCE/TEST ONLY; NOT COMMISSIONED.** At the composed C2 issuer/reverse
listener boundary, custody selection compared issuer, audience and `kid`, but
not the actual public-key bytes. Two different Ed25519 keys can carry the same
metadata. A synthetic test showed the prior composition would accept a custody
configured with the wrong original or source key. The existing later custody
append still compares the signed proof and the lease's pinned key/source trust;
this finding is not evidence that a forged source terminal or a production
assertion was accepted. The defect is that a bad composition was allowed to
be constructed and could fail only later.

## Fix and compatibility

The existing synchronous custody selection now also compares the SHA-256 of
the actual public SPKI for **both** keys. It accepts only an exportable public
Ed25519 key at this boundary, and fails closed if extraction, metadata or pin
does not match. The issuer fingerprint is derived from the exact public key
published by the prepared JWKS; the source fingerprint is the already selected
registration SPKI. Both `bind_custodied_issuer` and
`create_reverse_transport` use this check, including the latter's existing
second check after asynchronous trust validation. Existing P7 issuer refusal
remains in place. No new bearer, listener, grant, DB or public API is enabled.

The persisted `portal.c2-independent-custody-binding.v1` digest is intentionally
unchanged, avoiding an implicit rewrite or migration of retained originals.
This selection fix is not itself key custody, source authority, an external
old-holder fence, or a proof of independently operated storage. A qualifying
environment must provide matching usable public keys and commission the real
identity/trust/ACL independently; unsupported key representations fail
closed rather than being silently equated by `kid`.

## Validation

- Added a synthetic negative for each different original/source public key
  with unchanged issuer/audience/kid. Before the fix the first mismatch was
  accepted and the focused suite was **16/17**, not PASS.
- After the fix, `npm test -- test/c2-human-issuer-composition.spec.ts
  test/c2-p7-review-runtime.spec.ts`: **21/21 PASS**, including matching
  composition, mismatched-key refusals, and unchanged fail-closed P7 startup.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** across two
  disposable PostgreSQL clusters, using synthetic source/owner keys and
  identities; original/terminal and recovery checks are not a real Edge ACK.
- Strict focused TypeScript check for the changed composition and test passed;
  `git diff --check` passed for tracked files only. Neither a full hook nor an
  integrated migration/restore was run. The PG harness used 0.4 CPU / 320 MiB
  per PG container and 1.2 CPU / 896 MiB for node; actual peaks were not
  measured. Test-owned `elp2-custody-` containers and network were absent in
  the post-run read-only census.

| Uncommitted local file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-human-issuer-composition.ts` | `50d84886c8e24b63ba3f1045c7f978168541406b52a66204c86550da051d8e73` |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `1d08115b994783cb750ee61ce5e4d7beca1b00eea1301a68304c60e2c744ef3a` |
| `apps/control-api/test/c2-human-issuer-composition.spec.ts` | `08b47297556c4f8dba86bb8323054f547e83dc9f4e20df986af8c22d631c2b0b` |

These hashes supersede earlier pins of the same files. Before mounting,
complete and independently verify P7 owner/writer authority, key provisioning,
P8/A2 and real source trust; reconcile the unfinished Recovery V2 old-holder
fence and terminal/ACK census; review and freeze WIP before full integration.
ELP2-10/11 and connected acceptance remain open. Rollback: leave candidate
unmounted and preserve issuer/restore refusal. No frontend action is requested.
