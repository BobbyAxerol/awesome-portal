# Portal Execution Edge — EX-BE-01

This workspace is the Portal-owned Rust boundary for the Execution cell. In
EX-BE-01 it is deliberately a library workspace, not a running service:

- `execution-contracts` owns canonical Portal envelopes and precision-safe
  domain facts;
- `ts-contract-v1` snapshots the proven Trading System v1 wire contract and
  validates all 22 Python enums plus 91 database CHECK vocabularies at build
  time;
- `ts-adapter-v1` builds only allowlisted `GET` request blueprints and maps
  v1 responses into fail-closed compatibility outcomes.

The workspace has no HTTP client, database driver, Redis client, broker code or
command method. It cannot call or mutate the Trading System. Network transport,
mTLS/delegated authentication and live read-only probes belong to EX-BE-02.

The immutable discovery evidence lives under
`upgrade/.../trading_system_portal_contract_pack`. `contract-pack.lock.json`
pins its identity and key generated inputs. The build fails if the vocabulary
counts or actual collection lengths drift.

Run the Docker-reproducible gate from the repository root:

```bash
./scripts/execution-edge-test.sh
```
