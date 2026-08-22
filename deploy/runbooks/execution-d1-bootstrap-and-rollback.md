# Execution D1 — bootstrap, acceptance and rollback runbook

> Current status: `PREPARED_ONLY / DO_NOT_EXECUTE`  
> Authority required to run: explicit Bobby D1 approval plus a named change
> window and rollback owner in the private owner-input file.  
> Scope: Portal-owned network and identity boundaries only. Trading System is
> read-only and unchanged; D1 sends no business traffic and starts no Portal
> application service.

## 1. Outcome and non-goals

D1 creates only this carrier:

```text
SGP 10.70.0.1/30
  -> approved public carrier, AWS UDP 51820 from one SGP /32
  -> AWS 10.70.0.2/30
```

WireGuard supplies routing, not application identity. Later D3 application
traffic additionally requires TLS 1.3 mTLS and a delegated RS256 JWT. D1 does
not deploy the Edge, Source Proxy, projection database or ingestor, and does
not call `/v1/orders`, `/v1/fills`, `/v1/positions` or `/v1/events`.

Permanent prohibitions:

- no Trading System source, container, Compose, database, Redis, broker, CLI or
  firewall change;
- no public/VPC-wide TCP 8443 or 8444;
- no shared SSH/WireGuard/mTLS/JWT/source/database credential;
- no default route, IP forwarding, NAT or broad VPC route through `portal0`;
- no runtime feature flag or registry delivery-profile activation.

## 2. Stop-gates

Before changing either host:

1. Private input passes `--mode readiness` on both cells.
2. `D1_AUTHORIZED=true`, confirmation timestamp, start/end window and rollback
   owner are explicit.
3. The SGP source address is proven stable and AWS EIP/SG ownership is known.
4. `/30`, peer IPs, UDP port, bridge CIDR, 8443/8444 and PKI/JWT ownership are
   approved.
5. Existing SSH recovery is tested separately and remains open throughout.
6. Current route/port/firewall/package/service baselines are captured with no
   secrets.
7. The WireGuard package version/repository provenance is recorded before
   installation.

The reviewed way to migrate the private input and open the owner window is
`scripts/execution-d1-open-window.sh`; it retains the prior mode-0600 revision
and cannot widen Trading System, command, Live or profile authority.

`AWS_EIP_ALLOCATION_ID` and `AWS_ROUTE_TABLE_ID` may remain empty for D1. They
must be filled and `--mode production` must pass before production
certification. D1 adds no VPC route-table entry; the `/30` is a host-local
connected route.

## 3. Preflight — read only

SGP:

```bash
cd /home/bobby/portal
./scripts/execution-d1-preflight.sh \
  --input /home/bobby/secure/portal-execution-d1-owner-input.env \
  --mode readiness --cell sgp
```

AWS runs the same reviewed script/release revision with `--cell aws`. Record
only pass/fail, package version candidates, interface/route names, port state
and timestamps. Do not record public values, keys, certificates or owner-input
contents in Git or logs.

Independently verify:

```bash
timedatectl show -p NTPSynchronized -p Timezone
ip -o -4 route show
ss -H-lntu
systemctl is-active ssh
```

On AWS, confirm that the recorded EC2 instance ID, Elastic IP and SSH host-key
fingerprint still identify the D0 host. AWS Security Group changes are owner
manual until a reviewed IAM read/change boundary exists.

## 4. D1a — freeze and recovery boundary

Record a sanitized change record containing:

```text
release commit
input schema version
UTC window
operators/rollback owner
pre-change route and listener digests
SSH recovery check
selected wireguard-tools version and repository
AWS SG rule ID after creation
```

Do not copy the private owner input or command history containing key material
into evidence.

## 5. D1b — packages, group, directories and identity delivery

Only after the stop-gates pass:

1. Install the recorded `wireguard-tools` package version; do not replace the
   kernel.
2. Create a non-login `portal-runtime` system group. Do not add Docker, sudo or
   SSH authority to it.
3. Create root-owned paths:

   ```text
   /etc/wireguard                         0700 root:root
   /etc/portal                            0750 root:portal-runtime
   /srv/primus/portal                     0750 root:portal-runtime
   /srv/primus/portal/execution-edge      0750 root:portal-runtime
   /srv/primus/portal/source-proxy        0750 root:portal-runtime
   ```

4. Generate one WireGuard private key per host and optional PSK under `umask
   077`, or deliver them through the approved secret channel. Exchange only
   public keys. Never print a private key/PSK or pass it in a command argument.
5. Render `portal0.conf` from the reviewed cell template directly into a
   root-owned staging path, verify mode `0600`, then install it. Do not render
   secrets inside the repository or `/tmp`.
6. The PKI owner may stage separate workload certificates and the public JWKS
   inventory at this gate, but no Edge/Proxy process starts. The SGP RS256
   private signing key never leaves SGP; AWS receives only the public JWKS.

Certificate acceptance before D2/D3:

```text
edge server cert: serverAuth + AWS WG IP/private DNS SAN
SGP client cert: clientAuth + Control API URI identity
source proxy cert: serverAuth + Portal bridge IP SAN
ingestor client cert: clientAuth + ingestor URI identity
all certs: expected CA, unexpired, separate keys, approved overlap window
JWT: RS256, exact issuer/audience/environment/resource, unique jti, <=60 s
```

## 6. D1c — Security Group, tunnel and host firewall

1. AWS owner adds exactly one inbound SG rule: UDP `WG_UDP_PORT` from the
   approved SGP stable `/32` to the recorded AWS instance/SG. Record the SG rule
   ID. Do not add TCP 8443/8444 rules.
2. Keep host firewalls enabled in their observed posture. Add only a required
   exact WireGuard peer rule; do not flush, replace or disable UFW/nftables.
3. Start `portal0` on AWS first, then SGP. Do not enable it at boot yet.
4. Confirm peer public keys, `/32` AllowedIPs, `/30` interface addresses and no
   default/VPC route. IP forwarding remains unchanged.
5. Prove handshake and the two tunnel addresses. Do not probe application or
   Trading System business endpoints.
6. After all D1 acceptance checks pass, enable `wg-quick@portal0` on each host.

## 7. D1 acceptance evidence

All must pass:

- handshake is recent and transferred bytes remain limited to acceptance
  traffic;
- each peer reaches only the other `/32` tunnel address;
- default route, DNS, SSH and existing Portal/Trading System health are
  unchanged;
- UDP carrier is allowlisted to the one SGP source;
- TCP 8443/8444 are still not publicly or VPC-wide reachable;
- stopping either peer closes the private path and does not affect Trading
  System containers;
- reboot persistence is not enabled until the non-persistent test passes;
- no key, certificate, JWT, API credential or business identifier appears in
  evidence.

Status after this gate is `D1_NETWORK_ACCEPTED / APPLICATION_DARK`, not source
availability.

## 8. D2 render-only preparation already available

D1 may render, but must not pull/start, the later dark services:

```bash
docker compose --project-directory /home/bobby/portal \
  --env-file deploy/execution-d1/edge-source-proxy.env.example \
  -f deploy/compose.execution-edge.yaml \
  -f deploy/execution-d1/compose.dark.yaml config --quiet
```

The overlay proves these boundaries in advance:

- Edge binds TCP 8443 only to the AWS WireGuard IP;
- Source Proxy uses host networking only to call `127.0.0.1:8000`, but listens
  only on the Portal bridge gateway at 8444;
- Source Proxy requires its own client CA and exposes exactly seven GET routes;
- the real Trading System read identity is injected only inside Source Proxy;
- Edge, projection ingestion, SSE and analytics flags remain false/`fixture`;
- no 8000/8444 Docker port publication exists;
- Edge and Source Proxy have non-root/read-only/cap-drop/resource boundaries.

D2 remains blocked by AWS OOM/I/O admission, immutable signed image digests,
private PostgreSQL placement/roles/PITR, runtime secret delivery, observability,
backup ownership and a separate owner authorization.

## 9. Rollback triggers

Rollback immediately on any of:

- SSH/recovery, default route, DNS or existing service regression;
- unexpected public/VPC reachability;
- route overlap, wrong peer identity/AllowedIPs or non-approved source address;
- host pressure or Trading System impact;
- secret/log exposure or inability to attribute the exact SG/firewall change;
- failed link-loss containment.

## 10. Rollback order

1. Capture sanitized failure timestamp and trigger; do not capture secrets.
2. Disable and stop `wg-quick@portal0` on SGP, then AWS through the preserved
   SSH recovery path.
3. Remove only the exact D1 host-firewall rule(s), identified from the change
   record. Do not restore a whole firewall ruleset over unrelated changes.
4. AWS owner revokes only the recorded UDP SG rule ID.
5. Confirm `portal0` and candidate routes are absent and default route/DNS/SSH
   have returned to the pre-change baseline.
6. Remove D1-rendered configs/keys only through the approved secret-destruction
   process after evidence capture. Remove only empty D1-owned directories.
7. Remove `wireguard-tools` only if D1 installed it, no other owner uses it and
   the recorded package rollback is approved. Never remove/change the kernel.
8. Do not restart or edit Trading System as part of rollback.

Rollback is successful only when both hosts match the sanitized preflight and
the Trading System health remains unchanged. A failed D1 is not retried until a
new change window and root-cause review are approved.
