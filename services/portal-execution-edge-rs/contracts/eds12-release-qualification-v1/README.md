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

## BR-EX-80 / BR-EX-81 boundary

BR-EX-80 is closed only when the source publishes a validated strategy
`timeframe`/`bar_interval`. Until then the frontend suffix rule remains visibly
`DERIVED`.

BR-EX-81 is closed only when the Portal drains complete retained order/fill
history through the private Manager relation pager into its append-only mirror,
with cursor/restart/dedupe/count parity proof. A current bounded profile page
is not subject history and must never be rendered as replay evidence.

Both are explicit, versioned source-owner inputs rather than unnamed Portal
technical debt. They do not authorize direct Trading System DB, Redis, broker
or CLI access.
