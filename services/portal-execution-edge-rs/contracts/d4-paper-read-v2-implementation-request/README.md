# N03 Trading-System-owned Incremental Source Implementation Machine Annex

Status: `REQUEST_ONLY / OWNER_IMPLEMENTATION_NOT_PUBLISHED / NO_RUNTIME_AUTHORITY`

This directory is the N03 machine annex of
`upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`.
Do not send or implement it as a separate owner request. It defines the
sanitized evidence package required to accept a Trading-System-owned
implementation of the N02 contract inside the single coordinated campaign. It
is not source code, an image, a deployment manifest or permission for Portal to
modify Trading System.

An owner package contains exactly:

1. `owner-implementation.manifest.json`;
2. `implementation-profile.json`;
3. `source-metrics.json`;
4. `query-plan-evidence.json`; and
5. `acceptance-results.json`.

N03 candidate and acceptance checks require the separately accepted N02 owner
pack. This prevents an implementation from inventing a contract after the fact.

Validate this request template:

```bash
python3 scripts/execution-n03-implementation-verify.py --mode template
```

Validate owner bytes without accepting runtime:

```bash
python3 scripts/execution-n03-implementation-verify.py \
  --mode candidate \
  --pack-dir /PRIVATE/STAGING/N03_OWNER_PACK \
  --n02-pack-dir /PRIVATE/STAGING/N02_OWNER_PACK
```

Final owner publication check uses `--mode acceptance` with the same two absolute
paths. Passing it proves only immutable, non-secret implementation evidence. It
does not start a service, open traffic, import files or promote a Portal reader.
