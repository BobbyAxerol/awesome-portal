# EX-BE-02-LIVE D1 preparation assets

Status: `OFFLINE_PREPARATION_COMPLETE / D1_NOT_EXECUTED`

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

The operator procedure and rollback are in
[`deploy/runbooks/execution-d1-bootstrap-and-rollback.md`](../runbooks/execution-d1-bootstrap-and-rollback.md).
