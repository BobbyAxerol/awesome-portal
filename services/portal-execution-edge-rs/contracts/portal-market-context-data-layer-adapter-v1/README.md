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
