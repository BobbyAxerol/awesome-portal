# EX-BE-02-LIVE — D4 Paper-read contract import

Date: 2026-08-25  
Status: `CONTRACT_IMPORT_COMPLETE / ADAPTER_PENDING / NO_SOURCE_CALL`

## Outcome

Portal now owns an exact, non-secret import of the five Trading System D4
Paper-read contract artifacts under
`services/portal-execution-edge-rs/contracts/d4-paper-read-v1/`.

This slice deliberately stops before Rust adapter/ingestor implementation. It
did not configure Source Proxy, access a credential, call a source route,
create a projection epoch or change any registry/runtime flag.

## Provenance evidence

The runtime-acceptance trust anchor is
`99e912f4de9d23b51a3c2b9bc68eacd0841e9dfc`. The current Trading System
worktree was observed at
`4ad8f87825733f7f4c0be1f3ac785f7702478d38` on branch
`feat/d4-paper-read-facade`.

For the guide, OpenAPI, allowlist, capability and Source Proxy location
template, a path-bounded `git diff --name-status` from the acceptance commit to
the observed HEAD returned no output. SHA-256 at both commits and in the Portal
copy matched exactly:

| Artifact | SHA-256 |
|---|---|
| `PORTAL_PAPER_READ_FACADE_GUIDE.md` | `d3fe1c26446cc7874572c251b462e87bc3a3111820cd2736cc5a27381aabdefd` |
| `portal-paper-read-d4-v1.json` | `620fc88821c44a4019079b48055fa709b932ebf28c243a3122c6cb217fd3121d` |
| `portal-paper-read-d4-v1.allowlist.txt` | `c45c3f3f4f8f0aecc5ef4bdac3dcdf1250af1057454d8c3a0312bf803ec6e9d9` |
| `portal-paper-read-d4-v1.capability.json` | `284caf2e299fbc71d924219d0f5312553a2c60c81a70adad716fb78cf093b11b` |
| `source-proxy-d4-read-locations.conf.template` | `87131db5b314f4756bc2cea088ce9ed8ca6066171dcaf74485467090b9b0f751` |

`MANIFEST.sha256` is the byte-integrity gate. `contract-pack.lock.json` binds
the source commits, observed branch/HEAD, per-file hashes and authority limits.
The older pre-acceptance guide hash is metadata only and is not imported.

## Validation

- five-file manifest verification: passed;
- both JSON artifacts and the lock file parse as JSON: passed;
- imported file set is exact: five source artifacts plus README, lock and
  manifest metadata;
- Git diff is limited to the contract import and canonical backend tracking.

## Post-import source re-verification

On 2026-08-25 the Trading System worktree was checked again read-only at HEAD
`6049a73e1674eb6da93ba78ad9b19b4a995a23c9` on branch
`feat/d4-paper-read-facade`. For the same five explicit paths:

- `git diff --name-status 99e912f..6049a73 -- <five-paths>` returned no
  output;
- SHA-256 from the runtime-acceptance tree matched the current worktree for
  every file; and
- those hashes still match `MANIFEST.sha256` in the Portal import.

This is a post-import provenance check only. It does not amend or rewrite the
dedicated import commit `fdd1f34`, and it did not open Source Proxy, read a
credential, call a source route or touch Trading System runtime state.

## Next backend slice

Implement a pure Rust D4 source-contract adapter against this locked pack,
then test route/parameter/schema/cursor/completeness/resync rejection offline.
Source transport and BUILDING-epoch ingestion remain later, separately gated
slices.
