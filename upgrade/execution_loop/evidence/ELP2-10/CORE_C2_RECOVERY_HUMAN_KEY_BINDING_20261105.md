# C2 recovery: pin the original human signing key — 2026-11-05

Status: **SOURCE-ONLY; NOT INSTALLED; RECOVERY NOT QUALIFIED.** Core baseline
`2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted candidate work.

The candidate previously bound a lease to the human issuer and authenticated
source identity, but not the human signing key. A restarted process could
otherwise accept a differently signed token under the same issuer and key ID.
The candidate now records a domain-separated public-key/issuer/audience/key-ID
fingerprint at issue and requires it during revalidation and new ENTER.
An already-entered transaction can still resolve its exact authenticated source
terminal after key rotation or revocation; this does not authorize new work.

The disposable-only additive upgrade adds the nullable pin to legacy schema;
it does not manufacture historical values. Legacy missing pins fail closed for
new entry. Installation requires fencing older processes, a reviewed migration,
backup/rollback and the normal integration gate; none occurred here.

## Exact source pins

- `current-human-candidate.ts`: SHA-256 `a1a0f713ffc54fc60412244685ec33caadb7cc089f7ce5bd1a24717b864c1cfb`.
- `current-human-candidate.sql`: SHA-256 `474c754fc16f894cbc48779e2f247b96f1978a1c568b803e6689970119637447`.
- `c2-human-issuer-upgrade-candidate.sql`: SHA-256 `ba2e14a40b0b1ab4d92a08347626438a602ae25f8fef52f6c547c710a48b9463`.
- `c2-owner-issuer-pg.spec.ts`: SHA-256 `df07c4581c6a3a492820d649843f6000ee6ac33b8c8ff7abdfca03777743bcef`.
- `scripts/test-elp2-restore-inventory-rls.sh`: SHA-256 `2639bd96cb0bad909aa36ed797cdc122fb8646ad288d498b64779c13b6654dde`.
- `restore-c2-original-recovery.ts`: SHA-256 `d5e69255b361f8bbe1412594b0bfe069b2a4b08b519c0b151fe647f2cae05571`.

## Focused evidence

- `bash scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **15/15**, exit
  0, disposable PostgreSQL. Tests include key/kid change, signed replacement,
  immutability, legacy schema upgrades, revoke and exact terminal settlement.
  The initial run was 14/15: its new assertion expected the wrong refusal code;
  the actual refusal was `BINDING_MISMATCH`. The corrected assertion and
  additional cases were rerun successfully.
- `... restore-original`: **7/7**, exit 0, isolated PostgreSQL and unit tests.
- `... c2-regression`: **8 passed, 102 skipped**, exit 0; this is selected
  regression, not the full suite. The sandbox-only first attempt could not use
  sudo; the permitted isolated-cell retry ran and completed.
- `git diff --check` passed. No normal hook or runtime installation was run.

## Remaining gates

Real registered Research source, authenticated owner acceptance/delegation,
issuer/listener commissioning and accepted A2 remain outstanding. An
independent authority checkpoint and old-holder fence, complete source
terminal/ACK readback and post-snapshot reconciliation have not been proven.
An isolated test or a local row is not source ACK or recovery cutover evidence.
B2 must remain unsigned until genuine A2 acceptance and its other prerequisites.
