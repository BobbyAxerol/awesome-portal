# EX-BE-02-LIVE D1 preparation assets

Status: `D1_NETWORK_ACCEPTED / APPLICATION_DARK`

These files prepare the smallest reversible SGP↔AWS-HK bootstrap. They do not
authorize or perform D1 and do not activate a Portal source, projection, query,
SSE, command or delivery profile.

## Asset map

| Asset | Purpose | Safe in Git |
|---|---|---|
| `owner-input.env.example` | Versioned decision schema and permanent safety locks | Yes; values are empty/examples |
| `wireguard/*.template` | Host-to-host `/30` peer configs with `/32` allowlists and no forwarding/default route | Yes; placeholders only |
| `pki/openssl-workload-profiles.cnf.template` | Separate X.509 EKU/SAN profiles and delegated JWT policy | Yes; extensions only |
| `pki/identity-inventory.md` | Exact secret placement, permissions, non-reuse and rotation contract | Yes; no material |
| `source-proxy/nginx.conf.template` | TLS 1.3 mTLS, bridge-only listener and seven exact GET routes | Yes; no credential |
| `source-proxy/trading-system-read-header.conf.example` | Runtime secret-file format for the dedicated TS read identity | Yes; placeholder only |
| `compose.dark.yaml` | D2 render-only overlay for Edge + host-local Source Proxy | Yes; all runtime flags false |
| `edge-source-proxy.env.example` | Non-secret Compose render inputs | Yes; digest placeholders |

The private owner file remains outside Git:

```text
/home/bobby/secure/portal-execution-d1-owner-input.env
```

It must remain mode `0600`. The parser treats it as restricted data, never
`source`s it and never emits values.

## Offline gates

```bash
./scripts/execution-d1-preflight.sh \
  --input deploy/execution-d1/owner-input.env.example \
  --mode template --cell none

./scripts/execution-d1-test.sh
```

When the owner later opens D1, run `--mode readiness --cell sgp` on SGP and
`--mode readiness --cell aws` on AWS before any mutation. Empty
`AWS_EIP_ALLOCATION_ID` and `AWS_ROUTE_TABLE_ID` are warnings at D1 because the
host-to-host tunnel does not change a VPC route table. They become mandatory in
`--mode production`, which is the explicit reminder/stop-gate before production
certification.

After the AWS owner creates the exact UDP 51820 rule from the approved SGP
`/32`, record its `sgr-...` identifier as `AWS_WG_SG_RULE_ID` and require
`--mode activation` to pass on both cells before starting `portal0`. This makes
rollback target one rule instead of an entire Security Group.

Open a bounded change window without sourcing or printing the private input:

```bash
./scripts/execution-d1-open-window.sh \
  --input /home/bobby/secure/portal-execution-d1-owner-input.env \
  --owner bobby --duration-minutes 120
```

This atomically migrates older input to v1, keeps a mode-0600 backup, enables
only D1 decision gates and preserves all five permanent safety locks as false.
`scripts/execution-d1-render-wireguard.sh` is the reviewed root-only renderer;
it reads identity files internally, validates the resulting config with
`wg-quick strip` and never places a key in argv or stdout.

After activation, requalify the AWS control-plane record without exposing
credentials by running `scripts/execution-iam-verify.py` on AWS-HK with values
read from the private owner file. It accepts only one exact UDP 51820 rule,
fails on duplicate/ranged/wildcard sources, verifies the EIP allocation and
effective route table, and reports attached-instance-profile/IMDS conditions as
D2 stop-gates. Its pure rule audit is covered by
`scripts/test_execution_iam_verify.py`.

The operator procedure and rollback are in
[`deploy/runbooks/execution-d1-bootstrap-and-rollback.md`](../runbooks/execution-d1-bootstrap-and-rollback.md).
