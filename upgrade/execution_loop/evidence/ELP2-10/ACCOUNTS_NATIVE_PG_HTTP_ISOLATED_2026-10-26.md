# Accounts native PG/HTTP isolated retake — 2026-10-26 UTC

Source: `docs/research-loop-plan@ed74740f1`, code `3d0ee663f`. This retake
addresses the 17 PostgreSQL cases skipped in the prior focused Accounts test;
it is **not** real Edge/source acceptance or an ELP2-10 closeout.

## Cell and result

- Isolated internal Docker network and disposable PostgreSQL; repository was
  mounted read-only, Vite cache and PostgreSQL data were separate tmpfs mounts.
  Resource ceilings: PostgreSQL 0.5 CPU/512 MiB, Node 1.5 CPU/1 GiB. Only
  test-cell data was created and discarded; no existing database or runtime
  was mounted or changed.
- Existing pinned images: PostgreSQL
  `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`,
  Node `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
- `npm test -- --run test/elp210-native-current-manager-account.spec.ts`:
  **31 passed, 0 failed, 0 skipped**, elapsed 38.83 s; 17 cases were previously
  skipped without `TEST_DATABASE_URL`. The other 14 overlap the previous
  focused run, so do not add 31 to its coverage count.
- The HTTP/PG cases use the real Core paths and an explicitly `TEST_ONLY`
  external source. Coverage includes native ENTER → physical HTTP finish →
  terminal ACK, changed projection before send, workspace and target denial,
  and same-original recovery after a lost terminal ACK. It does not establish
  current source identity, a real Edge grant, production economics or SSE.
- The first attempt stopped before executing tests: the read-only mount prevented
  Vite's temporary cache write (`EROFS`). After mounting only those cache paths
  as tmpfs, the retake above passed. No authority or application guard was
  weakened to obtain the result.
- After the run, exact owned containers
  `control-api-test-node-20261026-2866802` and
  `control-api-test-postgres-20261026-2866802`, and network
  `control-api-test-net-20261026-2866802`, were absent on read-only inspection.
  No external service, retained data, credential, grant, UI or remote push changed.
  Test output was observed directly; no separately captured raw log is claimed.

## Remaining

The real source still needs the membership-aware Research reader and current
original requested from Edge in [the source-discovery packet](CORE_EDGE_MEMBERSHIP_READER_DISCOVERY_2026-10-26.md),
followed by genuine ROOT/CURRENT and independently granted STREAM/revoke/recovery.
Financial source proof/APPLIED→ACK, approved budget/calibration, coexistence/G2,
full R2 and browser acceptance remain open. Claude may consume existing fixture
and perform visual work; this retake does not publish any new UI contract.
