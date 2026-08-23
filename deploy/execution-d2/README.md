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

Before opening a live D2 window, run the read-only target-host admission gate:

```bash
sudo -n python3 scripts/execution-d2-host-admission.py
```

Preflight fails closed below 8 GiB available memory or 50 GiB Docker disk, on
unsafe current CPU/memory pressure, NTP/listener/container/runtime-ownership
drift, and until historical non-Portal OOM evidence has an explicit owner
review. Elevated pre-existing I/O is recorded as a warning. Observation then
requires an accepted baseline from the same boot that is no more than 30
minutes old, exactly three running dark services, at least 6 GiB available
memory and bounded positive CPU/memory/I/O PSI deltas.
`--acknowledge-historical-oom D2_NON_PORTAL_OOM_REVIEWED` records only the
owner attribution; it cannot override either stage.

```bash
sudo -n python3 scripts/execution-d2-host-admission.py \
  --acknowledge-historical-oom D2_NON_PORTAL_OOM_REVIEWED \
  > /secure/path/d2-preflight.json

sudo -n python3 scripts/execution-d2-host-admission.py \
  --mode observation \
  --baseline-report /secure/path/d2-preflight.json \
  --expected-portal-containers 3 \
  --acknowledge-historical-oom D2_NON_PORTAL_OOM_REVIEWED
```

`--mode readiness` additionally requires the real `portal-runtime` group and
root/group-owned secret layout on the target host. It remains a future D2
change-window check and is not satisfied by offline preparation.

Owner authority is a separate, machine-checked input. Copy
[`owner-input.env.example`](./owner-input.env.example) to a Bobby-owned mode
`0600` file outside the repository, fill evidence references without secrets,
then run:

```bash
./scripts/execution-d2-authorization.py \
  --input /home/bobby/secure/portal-execution-d2-owner-input.env \
  --mode readiness
```

Readiness validates an active window of at most two hours, an exact source
commit and image/evidence digests, signed-image and workload-identity review,
accepted host/OOM/resource gates, the exact instance-profile association and
explicit detach/IMDS approvals. It never sources or prints the input. Repeat
with `--mode activation` only after the profile is proven detached and IMDS
hop-limit one is independently verified. Both modes permanently reject source,
ingestion, Query, analytics, SSE, delivery-profile, command and Trading System
change authority.

The EC2 isolation itself is also machine-checked. On AWS-HK, use only the
privately recorded exact target values:

```bash
python3 scripts/execution-d2-isolation.py \
  --mode verify \
  --region AWS_REGION \
  --instance-id AWS_INSTANCE_ID \
  --association-id INSTANCE_PROFILE_ASSOCIATION_ID \
  --expected-profile-arn EXPECTED_D1_PROFILE_ARN
```

`verify` changes nothing and passes only on EC2 `DryRunOperation`. Inside the
approved <=2-hour window, repeat with `--mode activate`, the exact window UTC
timestamps and `--authorize D2_ISOLATE_TEMPORARY_OPERATOR_PROFILE`. Activation
checks the exact instance/profile/association, applies IMDSv2 endpoint enabled,
tokens required and hop-limit one, waits for `applied`, detaches that one
association, and then fails closed until the IMDS role-credential endpoint is
absent. It never starts a Portal service and cannot reattach a profile.

The full Portal remains on SGP. D2 deploys only the minimal Edge, Source Proxy,
schema-only projection PostgreSQL and one-shot migrator on the existing AWS-HK
execution host; no dedicated Portal EC2 is planned.

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
