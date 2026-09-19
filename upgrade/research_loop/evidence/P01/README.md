# Research Loop v1.1 — P01 evidence

P01 is a redacted, source-only baseline. It does not connect to a running
Portal, Execution Edge, Trading System, database, broker, CLI, Docker daemon,
browser host, or deployment helper.

## Regeneration and verification

From the repository root:

```bash
node scripts/research-loop-v11/p01-baseline.mjs --write
scripts/research-loop-v11/test-p01-baseline.sh
```

`--write` is deliberately the only mutating mode and writes only this P01
evidence directory. `--verify` is read-only. `--self-test` writes a temporary
copy under the operating-system temporary directory and removes it in a
`finally` block.

`test-p01-baseline.sh` also refuses tracked or untracked changes below the
captured Portal/Control API/Strategy/Edge/deployment/hi-fi roots. This prevents
an accidental local implementation or environment artifact being folded into
the named P01 capture. The P01 script, evidence and Unified Plan are outside
that input fence so their coherent documentation update can be verified.

Do not hand-edit generated JSON/CSV baseline files. Any change to a tracked
input recorded by `baseline.json` must regenerate the inventory and pass the
same test script in the coherent change. This prevents a stale source map from
being used as acceptance evidence. The generator also records a redacted static
database/configuration source inventory; it contains migration/configuration
file hashes and flag names only, never configuration values. Recursive scans
exclude dot-files and local build/cache directories; the only environment
example inspected is the explicit redacted `deploy/.env.development.example`
input recorded in `baseline.json`.

## Evidence lanes

- `SOURCE_INSPECTED` and `CONTRACT_MAPPED` are static-source claims only.
- `NOT_BROWSER_VERIFIED` is intentional: no screenshot, trace, DNS, port,
  deployed build or visual assertion was run in P01.
- `REAL_DELTA_E2E` remains a P04 gate because an authorized immutable reader
  snapshot and the QuantBT 1.1.1 transition are not present in this phase.

The files here contain only paths, hashes, source locators and redacted local
host measurements. No credential, DSN, token, cookie, market data, artifact,
database row, screenshot or trace is versioned.
