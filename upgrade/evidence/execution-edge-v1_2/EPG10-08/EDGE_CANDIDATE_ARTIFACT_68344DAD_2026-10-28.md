# Edge candidate artifact — 68344dad / 28 October 2026

**BUILD_PASS / OFFLINE_FAIL_CLOSED_PASS / NOT_INSTALLED / CONNECTED_NOT_MET.**
This is a bounded correctness artifact receipt, not source authority, a release
image, runtime admission, production capacity or connected acceptance.

## Exact source and artifact

- Source: `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`,
  `feat/core-current-policy-wire-20261024`, clean immutable commit
  `68344dad9042860f561c11873096314b9a9b2f73`.
- Rust workspace Git tree: `a310370306cd2cbcbceb00ad23189b1296b3de6a`.
- Cargo.lock SHA256:
  `7ca06ffde688641963539acdbf0a0f2832b75e1f2d520c87856d870d3a3cc85e`.
- Existing release recipe `deploy/images/execution-edge.Dockerfile` SHA256:
  `e5e7bd4c85ba272e28036b7ebaf979fe671d8556318a9949cd3ae229775cd5ce`.
- Pinned public Rust1.85.1 build image:
  `sha256:9f841bbe9e7d8e37ceb96ed907265a3a0df7f44e3737d0b100e7907a679acb36`.
- Actual build: `cargo build --locked --release --package edge-service`, exit0
  at `2026-10-28T09:27:33Z`, after15m19s. One CPU/2GiB/pids256,
  read-only coherent source, unique external Cargo cache and target.
- Retained HK executable (outside all source checkouts):
  `/home/bobby/.local/share/portal-execution-edge/candidates/68344dad-20261028/portal-execution-edge`.
- Binary size: `29614768` bytes. SHA256:
  `60c2e70711b4620cf173195393f9a26f2afe9babcd8be70a1aa3f74e1e891af8`.
- Same-directory `PROVENANCE.md` and bounded build/smoke logs retain the actual
  invocation, toolchain, source and cleanup observations. Binary/log/cache bytes
  are NOT copied into Git or to Core by this public Markdown handoff.

Initial runner stopped before compilation because rustup attempted a sync into
a deliberately read-only toolchain. Explicit selection of the image's existing
`RUSTUP_TOOLCHAIN=1.85.1-x86_64-unknown-linux-gnu` corrected only the disposable
runner; source unchanged. Keep that predecessor, do not call it a product test.

## Actual offline smoke

At09:28:04–09:28:07UTC the new binary was mounted read-only into the already
present canonical Distroless runtime base
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`.
The image itself still contains its original binary; the mounted candidate and
its independent hash identify this test. Explicit overridden entrypoint only;
no image default/serve, ports, network, private configuration or source mounts.
Each cell: `--rm`,1CPU/512MiB, read-only root, clean environment,10s timeout.

| Explicit command | Observed outcome | Expected refusal |
| --- | --- | --- |
| `core-native-relations-check` | exit1 / OFF | PASS |
| `core-command-status-check` | exit1 / OFF | PASS |
| `core-financial-check` | exit1 / invalid missing input | PASS |
| `core-financial-trust-check` | exit1 / invalid missing input | PASS |

**4PASS /0FAIL** negative smoke; not four configured/connected specimens.
No DB connection, listener, command, grant/session, operational configuration,
production container or authority was installed/changed.

## Custody, cleanup and next permitted action

Retain this explicitly named candidate executable/provenance for the active
feature; do not treat the older7ab60fb4 binary or canonical8814cd2a image as
equivalent68344dad source. Retention:17files/29646359bytes. PROVENANCE.md SHA256
`2e13b8b94b7c2694f59b17ae5c6ec04bd1d17e97dadc0e749d53283f7d2f04f6`;
SHA256SUMS SHA256
`8d93807983831b7328e23be12c215b00cb65f5d1a14d2354f343439d88256de7`,
16/16entries MATCH. Source68344dad and Cargo.lock unchanged after verification.

Cleanup DONE: exact owned temporary build/cache tree1158475055bytes removed;
both owned containers absent; newly pulled public compiler removed after zero
container references. No broad prune, shared cache/volume/network or operational
state deletion. Root available bytes entry99895607296 → precleanup89943285760
→ postcleanup92264054784; later09:31:51UTC90995834880 under peer activity, so
do not attribute the global delta as reclaimed. Final shared Docker inventory
275images/61active/110.5GB; BuildKit984entries/63active/88.11GB, untouched.
Actual Paper/Sandbox/Live Edge and native Manager IDs/images/start times/
restart0 unchanged; active/rollback operational artifacts retained. No SGP
test/build resource, private transfer or binary copy was created by this slice.

Core can review/prepare its consumer now using
[the CLI/type/source handoff](EDGE_CORE_READY_TO_CONSUME_2026-10-28.md).
Before an actual Edge install, match genuine private source transport, current
purpose-specific authority/trust/config/acceptance and a feasible fresh window.
No extra source bundle/framework is required. Final build success does not
remove those source commissioning inputs or close full08/read09.
