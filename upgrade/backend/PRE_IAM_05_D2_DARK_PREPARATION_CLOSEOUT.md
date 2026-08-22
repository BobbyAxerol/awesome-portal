# PRE-IAM-05 — D2 Dark Preparation Closeout

Date: 2026-08-22  
Branch: `feat/execution_loop`  
Status: `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`  
Runtime status: `D2_NOT_AUTHORIZED / NO_SERVICE_STARTED`

## 1. Acceptance decision

The offline preparation boundary for D2 is accepted. The repository now owns
build, publication, dark Compose, identity/config preflight and deterministic
rollback assets for the Rust Execution Edge and GET-only Source Proxy. Both
images were built locally and inspected as non-root, read-only, capability-free
containers with no network. Source Proxy configuration and workload identities
also passed real Nginx/certificate/key/trust/JWKS readability checks.

This acceptance does not authorize D2. No AWS host, WireGuard interface,
firewall/Security Group, private route, Portal service, Trading System route,
source read, registry profile or runtime capability was changed. Test images
are removed by the gate's cleanup trap. Stable v1.0.1 is untouched.

## 2. Delivered artifacts

### 2.1 Reproducible image boundary

- Execution Edge remains a two-stage pinned Rust/Debian image and runs as
  `65532:65532`;
- Source Proxy has a dedicated Dockerfile pinned to the multi-platform digest
  of Nginx Unprivileged 1.27.4/Alpine 3.21 and runs as `101:101`;
- the GHCR workflow publishes both images independently by commit/tag and asks
  BuildKit for maximum provenance plus SBOM attestations;
- no certificate, key, source credential, environment address or rendered
  config enters either image.

### 2.2 Dark service manifest

Both services have:

- immutable digest-only image inputs;
- non-root primary UID/GID plus the numeric `portal-runtime` supplemental group
  needed for root/group-owned `0640` identities;
- read-only root filesystems, all Linux capabilities dropped and
  `no-new-privileges`;
- bounded PIDs, CPU, memory/reservation, open files, tmpfs and JSON log rotation;
- explicit health/stop boundaries and no public Source Proxy/Trading System
  port publication.

The Edge binds only the future WireGuard address. Source Proxy remains host
networked solely because the published Trading System gateway is loopback-only,
but its rendered listener is the Portal bridge gateway, never `0.0.0.0` or the
public/VPC address. Projection ingestion, realtime, analytics and every
delivery profile remain false/`fixture`.

### 2.3 Fail-closed preflight and renderer

`execution-d2-preflight.sh` parses an allowlisted env grammar without `source`.
It rejects:

- tags, template digests outside template mode and malformed source digests;
- public/overlapping listener metadata or a mismatched Edge→Proxy origin;
- non-Paper environment and any enabled projection/realtime/analytics/profile;
- secret paths outside the mounted boundary;
- missing/symlink/empty files, wrong numeric group or mode;
- invalid/near-expiry certificates, invalid keys, certificate/key mismatch,
  broken trust chains or reused workload keys;
- empty/non-RSA JWKS, placeholder source identity or short admission token.

Readiness additionally requires the real `portal-runtime` group and the
approved `/srv/primus/portal` layout. It remains unexecuted on AWS.

The Source Proxy renderer substitutes only the validated bridge IP and private
port into an atomic mode-0640 output. The Trading System read identity remains
a separate runtime include and is never parsed, logged or copied by the
renderer.

### 2.4 Rollback preparation

The offline rehearsal renders candidate and rollback manifests using different
immutable Edge/Proxy digests. After normalizing only those digests the manifests
must be identical. Both revisions independently pass every dark/security/
resource invariant. This proves a config-preserving image rollback plan, not a
live RTO/RPO or host rollback.

The D2 runbook fixes the future order: preflight, verify attestations and
baselines, Source Proxy then Edge; rollback stops Edge then Proxy and removes
only D2-owned containers/network. It never restarts or edits Trading System and
does not remove accepted D1 unless D1 itself is implicated.

## 3. Qualification evidence

### 3.1 Focused manifest/preflight/rollback gate

Command:

```bash
./scripts/execution-d2-test.sh
```

Passed:

- safe parser and dark-lock rejection cases;
- generated PKI/JWKS/source-identity permission and trust checks;
- candidate and rollback Compose render/equivalence;
- non-root/read-only/cap-drop/PID/CPU/memory/nofile/logging assertions;
- no public `8000`/`8444` publication;
- malicious env input remained inert.

### 3.2 Runtime image boundary gate

Command:

```bash
./scripts/execution-d2-test.sh --build-images
```

Passed:

- pinned Source Proxy and Execution Edge runtime images built successfully;
- image metadata reports `101:101` and `65532:65532` respectively;
- both inspection containers ran with `--network none`, read-only root,
  all capabilities dropped and `no-new-privileges`;
- Nginx 1.27.4 parsed the rendered TLS/mTLS config and could read only the
  supplemental-group identities;
- the Edge binary and its mode-0640 server key were readable by the intended
  supplemental group;
- temporary fixture identities, containers and test images were cleaned.

The first test attempts exposed and closed three real operational gaps before
acceptance: Docker access had to retain the scoped `sudo -n docker` boundary,
Nginx cache tmpfs needed UID/GID ownership, and syntax validation needed a
loopback-only test listener rather than fabricating the future bridge address.

### 3.3 Repository gate

`execution-d2-test.sh` is now part of `verify-workspace.sh`. The existing D1
offline test continues to prove that no network gate was authorized or widened.

## 4. Explicit residual blockers

Real D2 remains blocked by all of:

1. accepted D1 network evidence and explicit Bobby D2 authorization/change
   window/rollback owner;
2. AWS OOM/I/O admission and approved CPU/memory/disk budgets;
3. published candidate and rollback digests with verified signature,
   provenance, SBOM and vulnerability disposition;
4. real separate mTLS/JWT/source identities and rotation owners;
5. private projection PostgreSQL placement, least-privilege roles, TLS,
   backup/PITR/restore/RPO/RTO ownership, or ingestion remaining absent;
6. target-host readiness preflight and exact listener/public-denial evidence.

Until those gates pass the correct status is
`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`, not D2 deployed.

## 5. Claude parallel lane

Claude continues the PRE-IAM-04 frontend packet. D2 preparation gives no
frontend permission to enable Lane B, EventSource, source, query, analytics or
command controls. Failure states and canonical fixtures may be implemented and
tested only on Lane A.

## 6. Next phase

The next canonical phase is PRE-IAM-06 tracking reconciliation. Codex reconciles
the Master Plan, backend guides and request ledger; Claude owns frontend roadmap
and evidence reconciliation. Every open item must have an exact owner, blocker,
next dependency and qualified status with no bare `COMPLETE`.
