# EX-BE-02-LIVE — D1 execution evidence

> Status: `D1_NETWORK_ACCEPTED / APPLICATION_DARK`  
> Evidence date: 2026-08-22 staging; 2026-08-23 activation UTC  
> Runtime profile: `fixture`; every Execution flag remains `false`  
> Trading System impact: none

## 1. Accepted gates

- Private owner input was atomically migrated to v1, opened for one bounded
  owner-authorized window and retained its prior mode-0600 revision outside
  Git.
- SGP and AWS both passed the same reviewed `readiness` preflight: candidate
  `/30` and Portal bridge routes do not overlap, UDP 51820/TCP 8443/8444 were
  free, NTP and SSH were healthy, and the five permanent safety locks stayed
  false.
- SSH Ed25519 host identity matched the private owner record before remote
  access. AWS public Trading System health passed before and after staging; no
  business endpoint was called.
- Package provenance is recorded: SGP installed
  `wireguard-tools=1.0.20210914-1ubuntu2`; AWS installed
  `wireguard-tools=1.0.20210914-1ubuntu4`. No kernel replacement or reboot was
  performed.
- Separate WireGuard private identities were generated on each host. Only peer
  public keys and one PSK crossed the existing authenticated SSH operator path.
  Keys were never emitted to stdout, argv, Git or evidence.
- Both `/etc/wireguard/portal0.conf` files were rendered atomically, validated
  with `wg-quick strip`, and verified as `0600 root:root`.

## 2. IAM and network acceptance

- Scoped STS and EC2 inventory proved the expected account, instance, VPC,
  subnet, attached Security Group, Elastic IP association and effective route
  table. EIP allocation and route-table IDs are recorded only in the private
  mode-0600 owner input.
- The pre-change Security Group contained no UDP 51820 overlap. Inside a new
  bounded owner window, exactly one UDP 51820-from-SGP-`/32` rule was created;
  its `sgr-...` identity is privately retained for exact rollback.
- Both cells passed the same activation preflight with zero warnings and zero
  errors. AWS started first and SGP second.
- Bidirectional peer-only reachability, recent handshake and bounded acceptance
  bytes passed. Default routes stayed unchanged and TCP 8443/8444 remained
  absent publicly and locally.
- A real link-loss drill stopped SGP `portal0`: the private path closed while
  existing SGP Portal and AWS-HK Trading System health stayed HTTP 200. The
  peer was restored, handshake recovered and both units were enabled.
- A collision-checked shared `portal-runtime` system GID was created on both
  cells. `/etc/portal`, `/srv/primus/portal` and its Edge/Source Proxy children
  are `0750 root:portal-runtime`.

No Edge, Source Proxy, projection, query, SSE or command service was started.
No source/business endpoint, Trading System container, database, Redis, CLI,
broker path, firewall or Portal delivery flag was changed.

## 3. Remaining stop-gate

The temporary operator instance profile is still attached to the shared AWS-HK
host and IMDSv2 currently permits a two-hop response. It must be detached, or
replaced by a separately reviewed workload-safe AWS identity boundary, before
D2 containers start. D2 also retains independent image-attestation, PKI/JWKS,
resource, projection-database, backup/restore and owner-window gates.

D1 acceptance is not authorization to widen the SG, edit Trading System,
activate a delivery profile or deploy D2 services.
