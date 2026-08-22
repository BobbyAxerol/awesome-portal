# EX-BE-02-LIVE — D1 execution evidence

> Status: `D1_HOSTS_STAGED / AWS_OWNER_SG_RULE_PENDING`  
> Evidence date: 2026-08-22 UTC  
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

## 2. Current runtime truth

- `portal0` is down on both hosts and is not enabled at boot.
- No host firewall or AWS Security Group rule was changed.
- No Edge, Source Proxy, projection, query, SSE or command service was started.
- SGP SSH and Docker remained available after package installation. Package
  post-install reported a pending kernel update and restarted/deferred normal
  host services through `needrestart`; there was no reboot and the post-checks
  passed.
- AWS SSH and the Trading System public health route remained available.

## 3. Intentional stop-gate

Neither cell currently has a usable AWS API identity, while the owner contract
requires `AWS_SG_CHANGE_MODE=OWNER_MANUAL`. Therefore D1 correctly stopped
before interface activation. The missing proof is exactly one AWS inbound rule:

```text
type       Custom UDP
port       51820
source     approved SGP_STABLE_PUBLIC_IP/32 from the private owner input
target     AWS_SECURITY_GROUP_ID from the private owner input
authority  Bobby AWS Console owner action
```

After creation, store the exact `sgr-...` identifier in
`AWS_WG_SG_RULE_ID`. Both cells must pass `--mode activation`; only then may the
operator start AWS `portal0`, start SGP `portal0`, prove the handshake and
perform link-loss/route/SSH/health acceptance. The interface must not be enabled
at boot until non-persistent acceptance is complete.

This is a permission stop-gate, not a failed D1 and not authorization to widen
the SG, edit Trading System, activate a delivery profile or deploy D2 services.
