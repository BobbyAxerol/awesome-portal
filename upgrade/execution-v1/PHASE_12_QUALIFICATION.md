# EDS-12 — Failure/DR, product acceptance and immutable release

Status: `STATIC_QUALIFICATION_READY / DEPLOYED_EVIDENCE_PENDING`

This is the final delivery gate for the Execution Durable Streaming plan. It
does not change the authority of a source, command, database, broker or
browser. Static qualification is useful because it makes a future runtime
promotion evidence-driven instead of a collection of undocumented flags.

## Scope frozen by this phase

| Item | Status | Qualification rule |
|---|---|---|
| Named same-origin Portal BFF reads | candidate | exact profile and source metadata remain in the server envelope |
| Portal-owned projection/query/local SSE | candidate | stale, partial, gap and unavailable states remain visible; no browser source access |
| Paper, Sandbox, Canary-over-Live, Live readers | staged | each profile needs its own deployed-image evidence; Canary uses the Live source profile but is a separate product stage |
| Commands and Live mutation | disabled | not part of EDS-12 reader qualification |
| P01 + R4/R5 | source-only integration | P01 base `f9e3d946`; verified integration `98c47b3` (portable-verification follow-up to `1c5a7fa`); both activation templates must retain lease TTL `900` |
| BR-EX-80 timeframe | Portal-derived adapter | a published source value wins; otherwise the named subject BFF derives only a known suffix and visibly labels it `DERIVED` |
| BR-EX-81 subject order/fill history | Portal retained-current-window adapter | the projection ladder drains existing Manager pages behind the Portal and exact subject BFFs read the durable mirror; this is never called authoritative replay |
| Market Context | Portal-owned Edge/Data Layer adapter | current observations and bounded BINANCE candles travel through fixed mTLS routes; when selected, no public-venue fallback is allowed |

## Evidence ladder

```text
STATIC_QUALIFIED
  -> OFFLINE_DR_QUALIFIED
  -> PROTECTED_MAIN_IMAGES_VERIFIED
  -> DEPLOYED_IMAGE_BROWSER_VERIFIED (each profile/stage)
  -> PRODUCT_ACTIVE + OPERATIONS_QUALIFIED
```

No step may skip another. A green local fixture, a BFF double, a source-dark
contract, a running container or a Git commit is not deployed product evidence.

## Exact static and offline gate

```bash
./scripts/execution-eds12-qualification-test.sh
./scripts/execution-eds12-qualification-test.sh --offline-dr
```

The first command validates N29 as the frozen predecessor, the EDS-12 package,
digest inputs, strict failure matrix, mutation cases and the pure Rust
authority. The second additionally runs the isolated N17A PostgreSQL
PITR/logical-restore/projection-rebuild harness. It uses disposable Docker
objects only; it must not be relabelled as AWS-HK or production evidence.

## Failure and recovery acceptance matrix

| Failure | Reader result | Recovery invariant |
|---|---|---|
| Source outage / network partition | `STALE` or typed unavailable | no browser bypass, no fake freshness, bounded retry only |
| Edge unavailable | typed unavailable | restore exact signed Edge image, then profile-local preflight |
| SGP projection DB outage | stale or typed unavailable | restore only Portal-owned data; no Trading System repair |
| Disk pressure | typed unavailable | pause new ingestion before retention-floor breach; never silently truncate |
| Cursor expiration/cycle | partial/resnapshot required | cursor remains opaque, relation/profile-bound; gap ledger retained |
| Epoch change | partial/resnapshot required | no cross-epoch join or implicit ordering claim |
| Schema/catalogue mismatch | typed unavailable | adapter remains dark until exact compatible revision is bound |
| Corrupt frame | partial/unavailable | reject before reducer/SSE; preserve diagnostic digest |
| Late correction | partial/resnapshot required | append correction provenance; never silently overwrite source truth |

The machine-readable authority is
`services/portal-execution-edge-rs/contracts/eds12-release-qualification-v1/failure-matrix.v1.json`.

## Protected-main / deployed evidence

After the normal protected-main workflow publishes signed images, SBOM and
provenance, create a sanitized evidence object outside Git and run:

```bash
# The protected SGP deploy writes/uploads this marker automatically.  For a
# manual audit, collect it from only release metadata, Docker labels/digests
# and health; this command does not call a source or inspect secret mounts.
sudo -n python3 ./scripts/collect-eds12-runtime-binding.py sgp \
  --release-manifest /srv/portal/releases/<commit>/release-manifest.json \
  --deployment-state /srv/portal/deployed-release.env \
  --output /secure/portal-sgp-runtime-binding.env

# Run on AWS-HK only after all Paper/Sandbox/Live Edge and Source Proxy
# projects have received the same exact candidate.  The collector rejects a
# mixed release rather than collapsing one profile's health into all three.
sudo -n python3 ./scripts/collect-eds12-runtime-binding.py aws-hk \
  --release-manifest /srv/primus/portal/releases/<commit>/release-manifest.json \
  --output /secure/portal-aws-hk-runtime-binding.json

python3 ./scripts/execution-eds12-qualification.py verify-deployed \
  --evidence /secure/portal-execution-eds12-deployed-evidence.json

# The prior command is semantic-only. PRODUCT_ACTIVE is only permitted after
# the signed candidate and both deployed cells bind to the exact same digest.
python3 ./scripts/execution-eds12-qualification.py verify-runtime-binding \
  --evidence /secure/portal-execution-eds12-deployed-evidence.json \
  --release-pack /secure/portal-release-candidate/<release-id> \
  --sgp-runtime-marker /secure/portal-sgp-runtime-binding.env \
  --aws-hk-runtime-marker /secure/portal-aws-hk-runtime-binding.json
```

The evidence must bind:

- the exact EDS-12 qualification digest and a protected-main `release_manifest.json`;
- digest-pinned images with signature, SBOM and provenance verification;
- the seven browser states (`ready`, `empty`, `partial`, `stale`,
  `unavailable`, `denied`, `error`) for each accepted profile/stage;
- all ten failure/recovery scenarios and no P0/P1 integrity issue;
- profile isolation/redaction, owner visual/data/action parity, and explicit
  command/Live-mutation non-activation.
- deployed proofs for BR-EX-80 derived/published timeframe provenance,
  BR-EX-81 retained-window parity and Market Context positive/negative chart
  routes. These are Portal-owned adapters; no separate Edge owner return is a
  prerequisite.

Only the verified workflow output writes the ignored runtime artifact
`artifacts/execution/release_manifest.json`. Its source template and validation
remain in source control; credentials and business rows never do.

## Release decision

Current decision is intentionally not `PRODUCT_ACTIVE`: protected-main signed
image evidence and deployed browser evidence have not yet been supplied to this
worktree. This is an external release-evidence gate, not unnamed technical
debt and not a reason to weaken readers or replace rich UI with fixture pages.
