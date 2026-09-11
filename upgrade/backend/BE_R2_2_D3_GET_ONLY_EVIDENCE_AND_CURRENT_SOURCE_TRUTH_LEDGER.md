# BE-R2-2 — D3 GET-only evidence and current-source truth ledger

Status: complete on 2026-09-11 for the approved `D3-AUDIT-20260911-BE-R2-2`
window. This is an observation and evidence phase; it did not change a running
image, feature flag, database, Source Proxy, Trading System, broker or command
plane.

## Scope and authority

The audit has exactly three profile-bound scopes:

| Environment | Exact Manager profile | Audience |
| --- | --- | --- |
| Paper | `PAPER_BINANCE_USDM` | `portal-execution-edge-paper` |
| Sandbox | `SANDBOX_BINANCE_USDM` | `portal-execution-edge-sandbox` |
| Live | `LIVE_BINANCE_USDM` | `portal-execution-edge-live` |

For each profile it uses deployment-bound mTLS and a new, short-lived RS256
delegated assertion for `execution:manager-v2:read`. It calls only:

- `GET /internal/v1/compatibility` as a legacy transport observation;
- `GET /internal/v2/manager/catalogue`;
- `GET /internal/v2/manager/capabilities`.

It does not request a relation page, record, cursor, order, fill, position,
event, database row, command or CLI operation. Browser code never receives the
certificate, key, JWT, relation selector or evidence body.

## Delivered controls

- `apps/control-api/src/cli/execution-d3-assertions.ts` retains the legacy
  corpus unchanged by default and adds opt-in `manager-audit-v1`. The new
  corpus adds validly-signed `wrong-resource`, `missing-resource` and
  `wrong-profile` negatives.
- `scripts/execution-d3-manager-live-audit.sh` owns a caller-owned `0700`
  temporary directory under the evidence directory. It destroys assertion
  files, temporary headers, generated wrong certificate and response bodies on
  exit. Evidence is created exclusively as `0600`.
- The runner rejects missing/wrong client identity, missing assertion and 13
  Manager JWT negatives. It verifies TLS 1.3 and HTTP/2 on every accepted HTTP
  response. A body is transiently schema-checked for the exact 96-relation
  catalogue and nonempty capabilities list, then replaced by summaries only.
- `apps/control-api/src/execution/current-source-truth-ledger.ts` produces a
  deterministic, redacted ledger for all 34 E5 fields, 96 Manager relations,
  54 named relation operations and 23 frozen screens. A raw `items`, cursor,
  row key, token, certificate or payload field fails closed.
- The ledger explicitly records `NOT_READ_D3_GET_ONLY`: `item_count` is null,
  coverage is metadata-only and it makes no empty/history/replay assertion.

## Observed evidence

The private files remain root-owned `0600` outside Git. Their content is not
copied into this repository. The safe SHA-256 bindings are committed in
[`execution-d3-current-source-reconciliation.v1.json`](../../deploy/manifests/execution-d3-current-source-reconciliation.v1.json).

The three Manager profile audits passed with the active catalogue digest
`sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44`,
96 relations and five metadata capabilities per profile. The resulting ledger
contains 34 capabilities, 96 relations, 54 named product operations and 23
screen classifications.

The legacy compatibility endpoint reached HTTP/2 with mTLS but returned typed
`503` after a valid legacy assertion. This is its active D2 fail-closed state,
not a Manager-v2 authentication success or a data source. It is intentionally
recorded rather than retried, bypassed or made authoritative.

`live_data_executor` is recorded from the committed runtime manifest as a
99-relation / 1,387-column raw Paper-candidate inventory. It remains neither a
Portal authority nor a Live Manager substitute; Portal has no direct database
access.

The older deployed runtime manifest and owner response retain catalogue digest
`9040…`, while the active Manager envelope and Portal pin are `0c71…`. No
runtime image was changed. The versioned reconciliation record preserves this
exact provenance discrepancy so the next signed release can supersede it
without rewriting historical evidence.

## Operator procedure

1. Create one caller-owned `0700` evidence directory and ensure no target
   evidence files already exist.
2. Build the Control API source that contains the audit CLI. Run the audit from
   a disposable, root-only container with certificate/key mounts read-only.
3. Run `execution-d3-manager-live-audit.sh` once for each exact profile. Pass
   the profile's pinned audience, the active catalogue digest and a
   `D3-AUDIT-*` window identifier.
4. Run `execution-current-source-truth-ledger.js` with the three resulting
   `0600` evidence files plus the committed owner response and runtime
   manifest. It runs network-none and writes a new `0600` ledger.
5. Retain only redacted evidence under the private owner evidence directory.
   Never add it to Git, a frontend fixture or a browser response.

If any validation fails, do not retry against a relation route or relax a
binding. Preserve the existing evidence, stop the window and resolve the exact
contract/provenance discrepancy first.

## Verification

- `./scripts/execution-d3-manager-audit-test.sh` — complete offline TLS/JWT
  matrix and cleanup proof with fake transport.
- `./scripts/control-api-test.sh` — TypeScript build plus unit contract tests,
  including deterministic ledger, profile crossing and raw-row redaction
  rejection.
- `./scripts/execution-be-r2-2-test.sh` — static reconciliation/documentation
  contract plus the offline runner test.

## Frontend handoff

Frontend may consume only named screen/panel classifications that a later BFF
publishes from this ledger. It must not call either Manager endpoint, infer
row-level data from a metadata audit, render an artificial replay, or fall
back to fixtures when a panel is partial or `SOURCE_GAP_CONFIRMED`.
