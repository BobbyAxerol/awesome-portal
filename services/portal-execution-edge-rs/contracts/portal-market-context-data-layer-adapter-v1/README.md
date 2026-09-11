# Portal Market Context Data Layer Adapter v1

This is a Portal-owned compatibility adapter for the existing Data Layer on
the AWS-HK Execution Cell. It is not a Trading System Manager-v2 contract
change and does not grant Portal direct access to a database, Redis, broker,
CLI, or the Data Layer listener.

The only admitted chain is:

```text
same-origin Portal BFF -> mTLS/delegated-JWT Edge -> mTLS Source Proxy
-> loopback Data Layer
```

The Source Proxy has exactly two market routes. Rust Edge validates and
normalizes their raw provider payloads into the existing Market Context v1
envelopes. A bounded provider candle page is not event replay or complete
market history; its response remains `POLL_BOUNDED` with `UNKNOWN` coverage.

## BE-R2-4 qualification status (2026-09-11)

The checked-in adapter is structurally valid, but it is **not deployed as the
Paper source route currently observed by Portal**. The safe, one-shot Paper
GET qualification established TLS 1.3, HTTP/2, mTLS and delegated-JWT profile
binding, then received the typed failure
`502 MANAGER_V2_SOURCE_CONTRACT_REJECTED` for the fixed `latest` operation.
The observed Source Proxy uses the `eds11r-r4-r5-manager-facade-extension`
route family instead of this adapter's direct loopback Data Layer shape.

The non-secret record is
[`execution-market-context-paper-qualification.v1.json`](../../../../deploy/manifests/execution-market-context-paper-qualification.v1.json).
It deliberately stores no raw market payload, credential, cursor or route
secret. `FEATURE_EXECUTION_MARKET_CONTEXT` remains false and no Paper,
Sandbox or Live chart route is considered accepted.

One source-owner resolution is sufficient: either restore this exact two-route
adapter, or make the Manager facade return the frozen Market Context v1
envelopes and headers for those two paths **with a checked-in owner-return
adapter revision and manifest binding**. It must then pass the fixed Paper
positive `latest`/`candles` and negative interval/profile matrix in a new
GET-only change window. Portal must not work around this with direct Data
Layer, database, Redis, browser or cross-profile access.
