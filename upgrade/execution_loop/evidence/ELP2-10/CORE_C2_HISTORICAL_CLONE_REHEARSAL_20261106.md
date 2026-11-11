# C2 candidate upgrade on a historical preview clone — 2026-11-06

**ISOLATED REHEARSAL ONLY.** No runtime migration, A2/P7 commissioning,
operational rollback or V2 restore qualification is asserted.

## Why

The previously retained preview backup already contains `elp210_candidate`.
The new-install `current-human-candidate.sql` cannot safely be treated as an
upgrade: the restored clone refuses its duplicate schema. This rehearsal uses
the separate, unmounted issuer-pin upgrade and selected candidate SQL after
the actual migration CLI through 0158. It does not drop or recreate the
historical schema, infer an issuer for an old lease, or contact preview.

## Method and result

- `bash scripts/test-elp2-c2-historical-clone.sh`: **2/2 PASS** (one
  disposable-target guard and one historical-clone rehearsal). The script
  verifies the retained backup SHA-256
  `324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`,
  mounts it read-only, creates an internal-only PostgreSQL container and a
  separate Node test container, and restores with owner/ACL rather than
  stripping them. `portal_research_runtime` is created as a TEST_ONLY
  `NOLOGIN NOINHERIT` role in that disposable cluster.
- A synthetic pre-C2 `ISSUED` lease is inserted **only in the clone**, before
  the comparison. The test fingerprints the historical columns of 14 named
  public/current-human tables before and after the selected 12 scripts and
  checks that all seven new original/issuer/custody fields remain null on the
  synthetic legacy row. The original backup is not modified. Count/digest
  comparisons include historical rows; no actual source authorization or
  synthetic identity is published.
- After 0155–0158, the test retains and compares each pre-existing selected
  schema/relation/column/function ACL and owner, RLS/policy, default ACL,
  trigger definition/enabled state, and two selected role/membership records
  across the candidate installation. The candidate block-new procedure is
  installed as a synthetic NOLOGIN definer without granting it operational
  rights on historical public tables. This validates its installation only;
  a real least-privilege ACL and execution remain unqualified. The local
  writer-fence head is checked disabled with no selected writer.
- Strict focused TypeScript check of the new test: **PASS**. `git diff --check`
  checks tracked files only, not these untracked files. The normal hook and
  full candidate review were not run.
- Checkout HEAD was `2faa8968fddbde59b2e59525e334ba3d83886144` plus the
  uncommitted candidate inputs below. The PG test image was
  `postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`;
  Node was `node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.

Initial attempts are not PASS: the first PG readiness probe saw the server
before the test database existed; the next tmpfs-backed restore disconnected
while creating a historical index (underlying cause not established); an
intermediate test omitted the procedure table and correctly hit the candidate's
`V2_C2_FENCE_COVERAGE_MISMATCH`. The final run uses the selected procedure in
order, an isolated anonymous data volume, and a non-vacuous legacy lease.

The PG container was limited to 1 CPU / 1 GiB and the Node container to
1.5 CPU / 1.5 GiB; actual peaks are **NOT_MEASURED**. The script uses `--rm`
and exact-container `rm -v` cleanup for its anonymous volume. Post-run
container/network name checks were empty; the anonymous volume identifier was
not separately captured, so its independent absence was not verified. No
pre-existing volume was targeted. The retained backup is intentionally kept.

## Pinned uncommitted inputs

| Input | SHA-256 |
| --- | --- |
| `apps/control-api/test/c2-historical-candidate-rehearsal.spec.ts` | `f9dbfa4bdd3661ba8aa0750900793f01a0e3a46d272c2f7e7a761782ca54fdaf` |
| `scripts/test-elp2-c2-historical-clone.sh` | `a21723ca2091c54a95c003b9c45901a75c492060fb518941cc22e056c67cff14` |
| `c2-human-issuer-upgrade-candidate.sql` | `83acce6eb8e350a0de21d73e958595a4bd7c205e0317812f5115a269c82edb26` |
| `c2-p7-acceptance.sql` | `9e6aa7c4adb5807d4a8a6b19d63f035de2089384f078af474dcb3eff1ec5ae1d` |
| `c2-p7-registration-table-candidate.sql` | `a806e9ad2da5d945c4ebe7a31d920365764b3fe7b87351e435749a1c837b6f1c` |
| `c2-p7-owner-intent-candidate.sql` | `6c29c72cca26a802dd05188412579f6e06a8c5bbb0ebd796d9db466cee7e0734` |
| `c2-b2-custody.sql` | `4532bb16acc884b3c5a27c5c34ad28558ba35c6c5ac9ef172785839563ed3c71` |
| `c2-p5-revision-outbox.sql` | `5bccd29dff016fb93708a45df318973dae77db2d9d3ec95cd1663433ba16d45f` |
| `c2-block-new-fence-candidate.sql` | `a1834c592ff192394e978cd3cbf2bb7da878960d2c2cdc31bc78c81c82af7f63` |
| `c2-block-new-procedure-core-candidate.sql` | `cd33a1d2b7627d4a2dcbf633631dda2b0bab07ca97afc9483e5f956de4fa1dcc` |
| `restore-local-generation-fence-candidate.sql` | `de44ec0cb5b46252c9653b66673b163e3807669a04eecf2f34702c78e1e87b6a` |
| `restore-local-generation-c2-extension-candidate.sql` | `37b8a0ce400cb7d09009ebdba15d96acd4f379f5e52454020ae24dc435bac05c` |
| `c2-delivery-obligation-candidate.sql` | `caeddead23601720e2082a0631f6e09a20c660b6177a6826611bd1fa679f608a` |
| `restore-local-generation-delivery-extension-candidate.sql` | `0b3c5e8633379e9a0c047164093659454d6e509c2f6450d33f85ae91896a4249` |

The SQL files are under `apps/control-api/src/execution-v2/`. This is an
additive preparation test, not a claim that all candidate files or historical
objects are covered. Further work includes independent authority and real
old-holder/source/ACK fencing, full integrated review and final restore/
rollback rehearsal. ELP2-10/11 remain open. No frontend action is introduced;
rollback is to keep these candidate SQL files unmounted and retain the restore
refusal.
