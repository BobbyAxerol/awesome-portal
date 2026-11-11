# C2 original-source revoke regression — 2026-11-05

**SOURCE_ONLY; not connected acceptance or a recovery/cutover gate.**

At 08:12 UTC, `bash scripts/test-elp2-restore-inventory-rls.sh c2-regression`
exited 0: **8 passed, 102 skipped**. The selected disposable PostgreSQL cases
cover refusal of new ENTER after revoke, settlement and idempotent replay of the
same authenticated COMMITTED/ROLLED_BACK original, conservative global revision,
quiescence observation, and signed source rollback before ENTER. Synthetic
source proofs and a local database do not establish a genuine Edge ACK.

Source SHA-256 `28976ac4751d9512a1165571cbb8a1a55ab56b49d093c33aaa829909a8494c2c`;
schema SHA-256 `d2ba9f1f1f29850bde5d4d68ef7ea34ac0a3226f901a62ab2d6c5a0ad56e749f`;
test SHA-256 `22e478b56486934bba941e214c8e4baecd64fceee2870ba840560ccff4ca17e3`;
runner SHA-256 `2639bd96cb0bad909aa36ed797cdc122fb8646ad288d498b64779c13b6654dde`.
The bounded runner cleaned its disposable cell; a subsequent container check
found no `elp2-restore-rls-` containers. The separate
[source-trust receipt](CORE_C2_RECOVERY_SOURCE_TRUST_20261105.md) gives the
remaining tests and limitations. No runtime, grant, DB or configuration was
installed or changed by this regression.
