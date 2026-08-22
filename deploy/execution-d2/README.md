# PRE-IAM-05 — D2 dark preparation assets

Status: `OFFLINE_PREPARATION_COMPLETE / D2_NOT_AUTHORIZED`

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
- optional local image build and no-network/non-root/read-only inspection.

Offline gate:

```bash
./scripts/execution-d2-test.sh --build-images
```

This command may build local test images and execute short `--network none`
inspection containers. It never starts Edge/Source Proxy services, opens a
listener, contacts AWS/Trading System, reads business data, changes a registry
profile or enables a runtime capability.

`--mode readiness` additionally requires the real `portal-runtime` group and
root/group-owned secret layout on the target host. It remains a future D2
change-window check and is not satisfied by offline preparation.

Deployment is still forbidden until D1 network acceptance, resource admission,
real immutable digests/signature verification, PKI/JWT/source identities,
projection database placement/roles/backup ownership and explicit Bobby D2
authorization exist.
