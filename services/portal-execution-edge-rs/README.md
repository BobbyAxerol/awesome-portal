# Portal Execution Edge — EX-BE-01/02

This workspace is the Portal-owned Rust boundary for the Execution cell. In
EX-BE-01 locked its contracts. EX-BE-02 adds the deployable, read-only boundary:

- `execution-contracts` owns canonical Portal envelopes and precision-safe
  domain facts;
- `ts-contract-v1` snapshots the proven Trading System v1 wire contract and
  validates all 22 Python enums plus 91 database CHECK vocabularies at build
  time;
- `ts-adapter-v1` builds only allowlisted `GET` request blueprints and maps
  v1 responses into fail-closed compatibility outcomes;
- `edge-auth` verifies local JWKS, RS256 delegated assertions with exact
  issuer/audience/environment/resource scope and a maximum 60-second TTL;
- `ts-transport` owns an exact-origin TLS 1.3 HTTP client, bounded concurrency,
  queue/request/body/retry limits and per-capability negotiation;
- `edge-service` exposes one mTLS-only compatibility endpoint on the AWS HK
  private address and loopback-only liveness/readiness probes.

The workspace has no database driver, Redis client, broker code or command
method. Transport accepts only the seven proven GET blueprints; it cannot call
an arbitrary path or mutate Trading System. The optional Trading System API key
is attached only to alpha-scoped reads and is loaded from a file.

The immutable discovery evidence lives under
`upgrade/.../trading_system_portal_contract_pack`. `contract-pack.lock.json`
pins its identity and key generated inputs. The build fails if the vocabulary
counts or actual collection lengths drift.

Run the Docker-reproducible gate from the repository root:

```bash
./scripts/execution-edge-test.sh
```

The AWS HK runtime is intentionally separate from the SGP Portal Compose:

```bash
docker compose --env-file deploy/.env.execution-edge \
  -f deploy/compose.execution-edge.yaml up -d
```

Use `scripts/execution-edge-live-probe.sh` from SGP after WireGuard routes,
PKI and a freshly delegated assertion are provisioned. No production capability
flag is enabled merely because the service or image exists.
