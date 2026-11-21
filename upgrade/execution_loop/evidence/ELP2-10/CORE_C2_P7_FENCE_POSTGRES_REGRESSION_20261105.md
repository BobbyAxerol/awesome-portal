# C2 P7 fence: PostgreSQL regression and corrected source pin

**SOURCE_ONLY; A2 remains NOT_READY.** This follows and updates the source
pin in `CORE_C2_ISSUER_P7_FAIL_CLOSED_20261105.md`; that older receipt and
its already mirrored bytes remain unchanged.

The new hard-fenced composition had inadvertently stopped constructing the
custodied issuer, and thereby skipped its configuration check for a mandatory
source-proof vault. Its constructor is again invoked to validate the exact
owner and custody configuration. The composition still denies issue and resume
until qualified P7 is implemented; this is not a configurable bypass. The
separately constructed reverse settlement transport remains possible.

The affected two-cluster test now asserts that a correctly bound owner and
request cannot create either a lease or an independent custody event without
P7. Other custody tests still exercise the isolated lower-level candidate;
they must not be mistaken for a commissioned issuer or real authorization.

Validation:

- Focused composition, P7 and recovery unit tests: **28/28 PASS**.
- `bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, two
  disposable PostgreSQL clusters with an isolated test peer. Script cleanup
  completed; `sudo -n docker ps -a --filter name=elp2-custody-` returned no
  containers. No persistent volumes or shared database were modified.
- Focused strict semantic typecheck of composition and its unit test: exit 0.
  An attempt including the PostgreSQL test exhausted its 1,024 MiB Node heap,
  exit 134; it did not pass. No core dump found under the Control API tree.
- `git diff --check`: exit 0.

New local WIP SHA-256 pins:

| File | SHA-256 |
| --- | --- |
| `src/execution-v2/c2-human-issuer-composition.ts` | `2c9cb0456e271e864feabbedc72bd435fcadbab0aff86fb4cf8b290c043cc7dc` |
| `test/c2-human-issuer-composition.spec.ts` | `a4ea76a732ca92e3c3b374a3d3aa7bc49ed36b932c7af638e39315eebcfc1f3c` |
| `test/restore-independent-custody-candidate-pg.spec.ts` | `32cd70c617591a4348ca7d47b751275cb4a8a6508cbd87d8ef9724b5026c1e66` |

An authenticated, recently stepped-up owner and a qualified current
acceptance/delegation remain necessary. Research's temporary acceptance
session is explicitly not human-presence or password proof, so it cannot
substitute for that requirement. Installed source registration, issuer,
listener, P8 and the independent restore/ACK barrier remain open. No token,
runtime, service, grant or B2 signature was created.
