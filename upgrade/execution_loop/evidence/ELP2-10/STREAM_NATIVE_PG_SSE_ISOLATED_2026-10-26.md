# Native STREAM PG/mTLS/SSE isolated retake — 2026-10-26 UTC

Source: `docs/research-loop-plan@37ea39142`, Core code `3d0ee663f`.
**This is not connected Edge/PM acceptance.** The source protocol endpoint in
the test is reviewed `TEST_ONLY` synthetic PM; no runtime permission or
source receipt was created or substituted.

## Scope and result

- `npm test -- --run test/elp210-native-frame-coupled.spec.ts`: **52 passed,
  0 failed, 0 skipped**, 126.42 s. Test code uses disposable PostgreSQL,
  loopback mTLS 1.3 and actual Core SSE sockets; its source is synthetic.
- The cases cover the independent STREAM grant (a finite READ baseline alone
  is insufficient), same-socket ordered frames, ACK and COMMIT/release fences,
  revocation, loss of ENTER or terminal ACK, scope/cursor/generation refusal,
  reconnect and same-original recovery. Do not count this as source qualification,
  product browser acceptance, load/G2 or an independently new coverage sum.
- Cell used an internal Docker network, read-only repository mount, separate
  tmpfs for DB and Vite cache. PostgreSQL was capped at 0.5 CPU/512 MiB, Node
  at 1.5 CPU/1 GiB; observed sample 244.3/674.6 MiB respectively is not a
  service budget or peak measurement. No other DB or service was mounted.
- Existing images: PostgreSQL
  `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`,
  Node `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
- Exact test containers `control-api-test-node-202610262876441`,
  `control-api-test-postgres-202610262876441` and network
  `control-api-test-net-202610262876441` were absent after cleanup. Test
  output was observed directly; a separately captured raw log is not claimed.

## Still required

Edge/source owner must return the actual qualified Research membership reader,
current original and trust pins requested in
[the source discovery packet](CORE_EDGE_MEMBERSHIP_READER_DISCOVERY_2026-10-26.md).
Core must then commission genuine ROOT/CURRENT and a separately authorized
STREAM, and record actual revoke/restart/recovery and browser receipts. No
grant, credential, production data, protected provider, dev/main/stable or
command/Live was changed by this retake. ELP2-10 remains open.
