# PRE-IAM-05 — D2 dark preparation assets

Status: `D2_HARDENED / LIVE_DEPLOYMENT_BLOCKED`

The canonical manifests remain `deploy/compose.execution-edge.yaml` plus the
reviewed dark overlay `deploy/execution-d1/compose.dark.yaml`; the latter stays
at its original path so the already-reviewed D1 package and rollback evidence
do not fork. This directory records the D2-specific gate and boundary.

Prepared artifacts:

- pinned non-root Edge and Source Proxy Dockerfiles;
- GHCR publication with maximum provenance and SBOM attestations for both;
- immutable-digest-only Compose inputs;
- read-only filesystems, all capabilities dropped, `no-new-privileges`, bounded
  PIDs/CPU/memory/nofile/log rotation and numeric `portal-runtime` supplemental
  group for `0640` workload identities;
- fail-closed D2 env/secret/config preflight;
- atomic non-secret Source Proxy configuration renderer;
- candidate/rollback Compose equivalence rehearsal;
- a pinned PostgreSQL 16 projection store with TLS/SCRAM, separate migration
  owner/runtime roles, an idempotent first-boot bootstrap and one-shot Rust
  migrator;
- optional local image build, no-network/non-root/read-only inspection and an
  isolated unpublished PostgreSQL + migrator + source-dark Edge boot test.

Offline gate:

```bash
./scripts/execution-d2-test.sh --build-images
```

This command may build local test images and execute short `--network none`
inspection containers. It also starts a disposable PostgreSQL and Edge on an
internal Docker network with no published port. The Edge must become ready
while no Source Proxy exists, proving that D2 performs no source probe. The
gate never contacts AWS/Trading System, reads business data, changes a registry
profile or enables a runtime capability; all test containers, networks,
volumes and images are removed by its scoped cleanup trap.

`--mode readiness` additionally requires the real `portal-runtime` group and
root/group-owned secret layout on the target host. It remains a future D2
change-window check and is not satisfied by offline preparation.

Deployment is still forbidden until the temporary D1 operator instance profile
is detached or otherwise proven unreachable by every Portal container, real
immutable Edge/Proxy digests and attestations exist, workload PKI/JWKS are
staged, the AWS pressure baseline is admitted and a D2 change window is open.
The Trading System read identity is deliberately not a D2 requirement: all
seven Source Proxy routes contain an exact 503 guard and no `X-API-Key` secret.

After this workflow revision is merged to the default branch, use GitHub
Actions → **Build and publish Portal images** → **Run workflow**, select the
immutable `feat/execution_loop` ref and scope `execution-d2`. The job emits the
checksummed `execution-d2-publication-<commit>` artifact only after provenance,
SBOM, Trivy CRITICAL rejection and keyless Cosign sign+verify succeed. HIGH
findings still require an explicit owner disposition before live D2.
