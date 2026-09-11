# EDS-12 release qualification contract

This package is the immutable, source-controlled admission contract for the
Execution Loop EDS-12 release gate. It deliberately separates three things
which must never be conflated:

1. **Static qualification** proves the committed Portal graph, source boundary,
   failure policy, rollback plan and versioned external gaps are internally
   coherent.
2. **Offline DR evidence** proves only isolated restore/rebuild containment;
   it is not an AWS-HK source activation or a production availability claim.
3. **Deployed product evidence** is produced only for an exact protected-main
   image set. It is the only input that may change the decision to
   `PRODUCT_ACTIVE` and `OPERATIONS_QUALIFIED`.

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
| `MANIFEST.sha256` | immutable package file set |

## Commands

```bash
# Static graph + mutation gate. It never opens a network connection.
./scripts/execution-eds12-qualification-test.sh

# Includes the disposable PostgreSQL PITR/restore/rebuild drill.
./scripts/execution-eds12-qualification-test.sh --offline-dr

# After protected-main has produced signed images and a deployed browser run:
python3 ./scripts/execution-eds12-qualification.py verify-deployed \
  --evidence /secure/portal-execution-eds12-deployed-evidence.json
```

`verify-deployed` rejects incomplete, unsigned, non-main, profile-mixed,
secret-shaped or runtime-widening evidence. It does not deploy, restart,
migrate, activate a source, dispatch a command or mutate Live.

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
