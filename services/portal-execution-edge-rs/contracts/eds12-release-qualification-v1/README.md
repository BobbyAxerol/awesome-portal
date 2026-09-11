# EDS-12 release qualification contract

This package is the immutable, source-controlled admission contract for the
Execution Loop EDS-12 release gate. It deliberately separates three things
which must never be conflated:

1. **Static qualification** proves the committed Portal graph, source boundary,
   failure policy, rollback plan and versioned external gaps are internally
   coherent.
2. **Offline DR evidence** proves only isolated restore/rebuild containment;
   it is not an AWS-HK source activation or a production availability claim.
3. **Semantic deployed evidence** records the profile/browser/failure matrix
   for an exact protected-main image set, but cannot itself claim activation.
4. **Two-cell runtime binding** cryptographically matches that semantic record
   to the N14A candidate pack and sanitized SGP plus AWS-HK runtime markers.
   It is the only verifier that may return `PRODUCT_ACTIVE` and
   `OPERATIONS_QUALIFIED`.

No file in this package contains a DSN, credential, token, private key, source
record or browser-safe access to the Trading System. The browser continues to
use named same-origin Portal BFF operations; the Portal retains mTLS and a
short-lived delegated JWT at the private Execution Edge boundary.

## Contents

| File | Authority |
|---|---|
| `qualification.v1.json` | exact EDS-12 scope, profiles, authority and release gates |
| `failure-matrix.v1.json` | all failure modes, safe reader state and recovery action |
| `qualification.v1.schema.json` | JSON shape for the qualification contract |
| `runtime-binding.v1.schema.json` | exact non-secret AWS-HK runtime-marker shape |
| `MANIFEST.sha256` | immutable package file set |

## Commands

```bash
# Static graph + mutation gate. It never opens a network connection.
./scripts/execution-eds12-qualification-test.sh

# Includes the disposable PostgreSQL PITR/restore/rebuild drill.
./scripts/execution-eds12-qualification-test.sh --offline-dr

# After an exact signed candidate is deployed, collect each cell's non-secret
# marker from Docker labels, image repo digests, health and release metadata.
# The collector neither contacts a source nor reads mounted credentials/data.
# SGP's protected workflow writes/uploads its marker automatically; AWS-HK
# runs the second command from its immutable release copy after its companion
# digest-pinned rollout.
sudo -n python3 ./scripts/collect-eds12-runtime-binding.py sgp \
  --release-manifest /srv/portal/releases/<commit>/release-manifest.json \
  --deployment-state /srv/portal/deployed-release.env \
  --output /secure/portal-sgp-runtime-binding.env
sudo -n python3 ./scripts/collect-eds12-runtime-binding.py aws-hk \
  --release-manifest /srv/primus/portal/releases/<commit>/release-manifest.json \
  --output /secure/portal-aws-hk-runtime-binding.json

# After protected-main has produced signed images and a deployed browser run,
# this is only a semantic evidence check; it remains non-active:
python3 ./scripts/execution-eds12-qualification.py verify-deployed \
  --evidence /secure/portal-execution-eds12-deployed-evidence.json

# PRODUCT_ACTIVE requires all three independent deployment facts. The SGP
# marker is a deployment-owned `KEY=VALUE` file with no secret values; the
# AWS-HK marker is a deployment-owned JSON file matching runtime-binding.v1.
# Keep both outside Git and protect them with the host's normal service-file
# permissions (root:root/0600 is the recommended operational convention).
python3 ./scripts/execution-eds12-qualification.py verify-runtime-binding \
  --evidence /secure/portal-execution-eds12-deployed-evidence.json \
  --release-pack /secure/portal-release-candidate/<release-id> \
  --sgp-runtime-marker /secure/portal-sgp-runtime-binding.env \
  --aws-hk-runtime-marker /secure/portal-aws-hk-runtime-binding.json
```

`verify-deployed` rejects incomplete, unsigned, non-main, profile-mixed,
secret-shaped or runtime-widening evidence. `verify-runtime-binding` further
rejects a candidate/image/manifest mismatch, missing SGP or AWS-HK service,
unhealthy runtime marker, command/live mutation/direct-source widening or a
symlinked evidence input. Neither command deploys, restarts, migrates,
activates a source, dispatches a command or mutates Live.

The collector refuses an ambiguous Compose identity, image without the exact
candidate repo digest, source-revision mismatch, unhealthy service, command
relay, direct-source-shaped runtime input or existing marker without an
explicit replacement flag. It collapses the three AWS-HK Paper/Sandbox/Live
profile projects only after all six Edge/Source Proxy instances prove the same
exact candidate image; it never lets one healthy profile stand in for another.

The protected publisher converts Cosign's array output into the exact
`portal.cosign-signature-evidence.v1` object before it enters the immutable
N14A evidence pack. The EDS-12 input pin includes that converter, so a future
release cannot silently return to an array-shaped artifact the pack rejects.

## BR-EX-80 / BR-EX-81 / Market Context boundary

BR-EX-80 is a Portal-owned derived adapter. The named subject BFF takes a
source-published `timeframe`/`bar_interval` when it exists; otherwise it may
derive only a known strategy-id suffix and labels it visibly `DERIVED`. It does
not require a new source return to be useful.

BR-EX-81 is a Portal-owned retained-current-window adapter. The projection
ladder drains the existing Manager current pages behind the Portal, then exact
Alpha/Account orders and fills BFFs read the durable Portal mirror with
cursor/restart/dedupe/count parity proof. Its history is visibly not
authoritative replay: a current retained window must never be rendered as
global lifecycle replay evidence.

Market Context is a fixed Portal-owned mTLS Edge/Source Proxy adapter around
the existing Data Layer. It supplies current observations and bounded candles;
when selected it has no public-venue fallback, and it never claims lifecycle
replay.

All three require actual protected-main deployed evidence before
`PRODUCT_ACTIVE`, but none requires direct Trading System DB, Redis, broker or
CLI access.

On 2026-09-11, the N29 input pin was refreshed after BE-R2-6 closed the
Portal-owned Governance Inbox/read-truth contract and deprecated V1
compatibility metadata.  The EDS-12 decision and every runtime authority stay
unchanged: this is a static provenance refresh, not deployed evidence or
activation.
