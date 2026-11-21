# Recovery V2 — signed checkpoint anchor candidate, 2026-11-06

**UNMOUNTED SOURCE/TEST ONLY.** Follow-through to [authority
readback](CORE_C2_RECOVERY_AUTHORITY_READBACK_20261106.md) and its
[stalled-reader fix](CORE_C2_RECOVERY_AUTHORITY_STALLED_READER_20261106.md).
The existing readback verifies a hash chain against a caller-supplied head;
the head by itself does not authenticate who selected it.

## Candidate and boundaries

`RestoreCheckpointSignedAnchor` verifies an Ed25519 envelope against the
selected public-key fingerprint, issuer and audience. The signed claims bind
the exact checkpoint, both cluster identifiers, generation, event hash,
operation ID and a maximum 120-second validity period. The wrapper first
checks the underlying reader's exact pin, then asks that reader to verify the
actual closed-observation journal head. It checks expiry again after the DB
read and returns `SIGNED_NOT_CUTOVER`, never an authorization to activate a
restore. Canonical encoding, bounded payloads and unexpected fields fail
closed. The existing raw reader remains an unmounted diagnostic path, not a
cutover authority.

This is a candidate protocol, not a commissioned independent signer. Its key
and issuer are configuration inputs; a matching fingerprint does not establish
independent operation or key custody. A formerly signed anchor could be replayed
against a rolled-back authority DB while still valid: an independent monotonic
head/anti-rollback policy and clock qualification are still required. Nor does
the signature fence an old holder, prove a complete source/terminal/ACK census,
or prove the writer/source database is closed. No private production key,
runtime identity, schema or authorization was created or changed.

## Tests and pins

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **23/23** on two
  disposable PostgreSQL clusters. The existing closed-DB case now creates an
  ephemeral test signing key and verifies a valid signed head against the real
  journal; rejects wrong key, cluster, audience, expiry, excessive lifetime,
  unexpected claims, wrong DB head, wrong configured pin/key and expiry during
  the read. These cases are part of the existing test, not extra independent
  test totals. They do not use a real operator key or connected Edge source.
- Strict focused TypeScript check of the new wrapper and PG test passed; an
  initial check failed on constructor definite-assignment and was repaired
  before the final run. `scripts/execution-tracking-test.sh` and
  `git diff --check` passed; the latter checks tracked files only, so untracked
  candidate files were not included by that command. Full typecheck, normal
  hook, migration/restore rehearsal and runtime commissioning were not run.
- The harness limited each PG container to 0.4 CPU / 320 MiB and the node
  container to 1.2 CPU / 896 MiB; actual peaks were not measured. The test's
  isolated containers and network were absent in the post-run Docker census.

| Local uncommitted file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-signed-anchor.ts` | `605bf3748393392115956e7d6671367eb2e56c3fcdb195ee66cdc655f5294892` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority-reader.ts` | `cc12dbfb93f2f81f20e4b1344502dba08549ecfee707ee24ae8dc278282d313b` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `5dfd05cff6ec71b746d1cd57d7b1819af15aabf6175780a1a0ca4f3e0605b9c6` |

These reader/test pins supersede those in the prior receipt; the SQL helper and
stalled-reader behavior did not change. Next: qualify independently operated
signer and anti-rollback channel, reconcile/fence old holders and source
terminal/ACK, integrate the WIP and rehearse representative restore. P7/A2,
connected tests and ELP2-10/11 remain open. Rollback: keep this wrapper
unmounted and the V2 restore refusal in place. No frontend action is requested.
