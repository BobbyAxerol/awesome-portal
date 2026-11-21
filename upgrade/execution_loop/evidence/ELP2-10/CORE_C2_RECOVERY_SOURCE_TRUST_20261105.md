# C2 recovery: bind the original source trust — 2026-11-05

**SOURCE_ONLY; A2 and recovery V2 remain NOT_READY.** This supersedes the
source/schema pins, not the historical test facts, in
`CORE_C2_RECOVERY_ISSUER_BINDING_20261105.md`. No runtime or DB was changed.

## Problem, scope and limitation

The prior candidate bound `workload_id` but took the configured TS source key,
issuer, audience and key ID from the current process. Restarting with a
different key under the same workload identifier could authenticate a terminal
as if it came from the original registered source. At ISSUE the candidate now
persists a domain-separated SHA-256 fingerprint of those public registration
facts (including the Ed25519 public JWK) alongside the original human issuer.
It rechecks that pin on ENTER, RESOLVE, recovery, revalidation, financial
replacement and STATUS delivery acknowledgment. The final recovery snapshot
rechecks the pin too. Existing lease immutability applies to both fields.

The fingerprint is public-key/identifier metadata, **not** proof that the
registration was authorized, a source receipt, an independent checkpoint or an
Edge ACK. Old rows lacking either pin remain unverified. A changed or missing
source pin is refused; after a legitimate rotation, recovery needs an audited
successor/rotation mechanism or the correctly pinned original trust. This
candidate does not implement such succession and must not silently treat a
same-name workload as authority. The already-approved rule allowing a signed
terminal after revoke remains true for the **same pinned key**; no new ENTER is
authorized.

The disposable-only additive upgrade handles schemas missing one or both pins
without backfilling old rows. Old workers must be fenced before deployment.
This file is not a production migration, and no deployed database was altered.

## Tests and dependency pins

- Before the final isolated replacement/ACK checks were added, PostgreSQL +
  synthetic mTLS recovery **7/7 PASS**, including changed TS key or `kid`,
  refusal of a replacement-key terminal, unchanged original phase, missing
  historical source pin and same-key recovery. The final additions affected
  only the separate replacement and acknowledgment paths.
- The isolated issuer suite on that candidate: **14/14 PASS**, including
  same-key terminal after revoke and the upgrade from neither column. After
  adding only the partial-upgrade test, that selected test passed **1/1**
  (**13 skipped**) for schemas missing either one or both pins.
- On the final Core source, selected financial replacement / STATUS ACK tests:
  **3 passed, 107 skipped**, exit 0, including rejection of a different public
  key and unchanged success with the correct source trust. These are synthetic
  PostgreSQL cases, not an actual Edge ACK.
- Candidate source SHA-256
  `28976ac4751d9512a1165571cbb8a1a55ab56b49d093c33aaa829909a8494c2c`;
  fresh installer `d2ba9f1f1f29850bde5d4d68ef7ea34ac0a3226f901a62ab2d6c5a0ad56e749f`;
  additive upgrade `4d10ddf83fbdf1024c154b1f4a506fd5bf20aad9045d73c52823769ac7d80da2`;
  recovery orchestrator `d5e69255b361f8bbe1412594b0bfe069b2a4b08b519c0b151fe647f2cae05571`.
- Final issuer test `3fb39eda94aeaf2e47baab7d3ff101c6a1e988d7932282cd3dd3c14150aad6af`;
  recovery PG test `f69ba036694dfa709792c4adc430a8bbb5979da19dd1aeda5767d22cbeded41c`;
  recovery unit `4b199b7633df5d3c3418a967f4e67f079cb843e6e968fe67851dd17221fd6e48`;
  financial/STATUS PG test `22e478b56486934bba941e214c8e4baecd64fceee2870ba840560ccff4ca17e3`;
  runner `2639bd96cb0bad909aa36ed797cdc122fb8646ad288d498b64779c13b6654dde`.
  Each isolated runner used aggregate 2 CPU / 1.5 GiB and cleans its own cell.

The actual P7 owner acceptance, qualified issuer/source registration, mTLS
listener, independent authority checkpoint, old-holder and HTTP fences,
complete post-snapshot terminal/ACK reconciliation, final typecheck and normal
hook remain open. This does not authorize B2, production/development changes,
command/Live or release.
