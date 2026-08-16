# Historical Market Data reader build input

This directory is a build-input boundary, not a source dependency. Production
Portal API images require the approved code-only wheel:

```text
primus_historical_market_data-0.1.0rc3-py3-none-any.whl
sha256 3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663
```

Wheel files here are intentionally ignored by Git. Do not copy the Historical
Market Data source checkout, storage, collector state, logs or secrets into the
Portal build context. GitHub image publishing stages the wheel from its
encrypted `HMD_READER_WHEEL_BASE64` environment secret and verifies the digest
before the Docker build. A VPS/local maintainer can run
`scripts/stage-hmd-reader-wheel.sh` against the separately approved wheel.
