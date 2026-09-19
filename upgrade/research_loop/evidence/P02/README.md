# P02 — Contract freeze and unchanged-Execution compatibility spike

This directory is the immutable, reviewable Research-side packet for P02. It
does **not** add a service, endpoint, database migration, credential, runtime
flag, deployment, or change to the released Execution Loop.

The compatibility claim is deliberately narrow: with the current Control API
and Research Portal source, a `POST /api/runs` returning `202` plus `run_id`
creates one local read model. The existing `ResearchRunSyncService` can refresh
that model from the existing Research read paths, after which the existing
strict Governance R1 request can create and read back a R1 record.

## What P02 freezes

- `research.run-request.v1` is a **future producer-side** supplemental
  envelope. Legacy `strategy_id`, `dataset_id`, and `protocol` remain
  top-level, because the unchanged facade reads them on its already released
  202 path. The P02 producer harness allows exactly its five frozen top-level
  keys; this is a Research-side validation rule, not a claim that the current
  facade was changed to enforce it.
- The R1 payload is exactly `governance.approval-create-request.v1`; it carries
  no Research RC object or experimental fields.
- Four different hashes remain different facts: `parameter_digest`,
  `legacy_selected_artifact_sha256`, `research_rc_manifest_digest`, and
  `execution_evidence_set_hash`. P02 never substitutes one for another.
- IDs remain explicit: Research alpha/version -> strategy adapter -> Execution
  subject. Only strategy adapter and Execution subject must be equal in the
  current R1 bridge.

## What P02 intentionally does not claim

- It does not prove a browser screen, new producer, real Delta data, holdout
  sealing/unlock, promotion-pick/reset, or current runtime authorization.
- It does not authenticate direct service-to-service calls. The current
  Python Research API has no verified Control-API principal middleware; P03/P10
  must close that producer/identity boundary before any new production write.
- It does not modify or create a new Execution contract. See
  `execution-compatibility-matrix.md` and `decision-register.json`.

Run the focused gate with:

```bash
scripts/research-loop-v11/test-p02-compatibility.sh
```

The Python venv is an ignored, constraints-installed local test environment,
retained for later Research phases; it is neither an artifact nor a deployment
input. The P02 gate intentionally verifies the freeze subset in the cached
Portal API runtime pin (Python 3.12.14) rather than weakening the frozen report
to match any developer workstation patch version.
