# D4 Paper Read Source Contract Pack

Status: `CONTRACT_IMPORT_COMPLETE / RUNTIME_INACTIVE / NO_SOURCE_CALL`.

This directory is the Portal-owned immutable import of the five non-secret
Trading System artifacts authorized by Bobby on 2026-08-25. It is an interface
contract, not Trading System source code and not runtime authorization.

## Provenance lock

The import trust anchor is Trading System runtime-acceptance commit
`99e912f4de9d23b51a3c2b9bc68eacd0841e9dfc`. The source worktree was observed
at `4ad8f87825733f7f4c0be1f3ac785f7702478d38` on 2026-08-25.

For exactly the five paths listed in `MANIFEST.sha256`:

- `git diff --name-status <runtime-acceptance> <observed-head> -- <five-paths>`
  returned no output;
- each file had the same SHA-256 at both commits; and
- each imported Portal copy has that same SHA-256.

The accepted guide digest is `d3fe1c...defd`. The older pre-acceptance handoff
digest `478eae...0ee7` is retained only as historical metadata in
`contract-pack.lock.json` and is not imported.

Run `sha256sum -c MANIFEST.sha256` from this directory before using the pack.
The machine-readable provenance and per-file locks are in
`contract-pack.lock.json`.

This commit imports contracts only. It does not contain a Rust adapter,
ingestor, source credential, proxy activation or projection epoch.

Do not add identity values, DSNs, runtime scope files, cursor keys, market/
trading rows or response bodies here. The Source Proxy secret remains an
owner-delivered root-owned runtime file on AWS-HK.
