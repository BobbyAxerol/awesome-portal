# D4 Paper Read v2 — Incremental Contract Request

Status: `REQUEST_ONLY / NOT_OWNER_PUBLISHED / NOT_RUNTIME_CONSUMABLE`

This directory defines the exact non-secret package Portal asks the Trading
System owner to publish for N02. It is not a source contract, runtime adapter or
permission to change Trading System.

An owner package contains exactly:

1. `owner-pack.manifest.json`;
2. `incremental-contract.json`;
3. `compatibility-fixtures.json`; and
4. `error-corpus.json`.

The examples here deliberately carry `owner_accepted=false` and synthetic
identifiers. They cannot pass acceptance mode and are never compiled into the
Rust v1 reader.

Validate this request package:

```bash
python3 scripts/execution-n02-contract-verify.py --mode template
```

Validate an owner draft without accepting it:

```bash
python3 scripts/execution-n02-contract-verify.py \
  --mode candidate \
  --pack-dir /PRIVATE/STAGING/N02_OWNER_PACK
```

Acceptance is a separate, read-only gate:

```bash
python3 scripts/execution-n02-contract-verify.py \
  --mode acceptance \
  --pack-dir /PRIVATE/STAGING/N02_OWNER_PACK
```

Passing acceptance proves package structure, owner decision, compatibility
facts and byte digests. It does not copy files, open traffic, start a service,
or select a delivery profile. Portal imports the accepted bytes in a separate
reviewed commit before N04 may consume them.
