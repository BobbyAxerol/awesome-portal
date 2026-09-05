# EDS-09 — Trading System Owner Return Handoff

**Status:** `MIRRORED_FOR_PORTAL_RESEARCH / NO_EVENT_TRANSPORT_PUBLISHED`  
**Portal receipt branch:** `docs/eds09-ts-owner-return-handoff`  
**Trading System source branch:** `feat/eds-09-event-source-return`  
**Trading System source commit:** `a5e390b7dadfcaea17e9d91fafb6150f69b63a4f`  
**Source image digest:** `null` — no image was built or deployed.

## 1. What is mirrored here

The immutable, sanitized Trading System source-owner package is mirrored
byte-for-byte at:

```text
upgrade/backend/trading-system-owner-returns/eds09-current-source-return-v1/
```

It contains the owner return, EDS-08 schemas, wire ruling, synthetic fixtures,
acceptance mapping, evidence and `RETURN_MANIFEST.sha256`. The source-side
copy remains in the Trading System repository as its provenance record; this
Portal mirror is the consumer-side receipt. Neither copy contains credentials,
certificates, direct source connections, business rows, account/strategy/
instrument identifiers, or command authority.

## 2. Exact ruling

The source owner assessed these classes jointly for PAPER, SANDBOX and LIVE:

| Event class | Result |
| --- | --- |
| `execution.position-lifecycle.v1` | `SOURCE_GAP_CONFIRMED` in all three profiles |
| `execution.fill-lifecycle.v1` | `SOURCE_GAP_CONFIRMED` in all three profiles |
| `risk.decision-lifecycle.v1` | `SOURCE_GAP_CONFIRMED` in all three profiles |

All **18/18** EDS-08 entries are `SOURCE_GAP_CONFIRMED`. This is a positive,
validated source-as-is result: the current source does not jointly prove the
owner epoch, contiguous global decimal `u64` sequence, immutable lifecycle
versions, correction/tombstone causality, retention floor, resumable cursor,
snapshot-to-tail boundary and bound event scope required by MC-01.

`owner_accepted: true` means the source owner accepts this return as its
truthful classification. It does **not** mean an Event class is accepted for
Portal ingestion.

## 3. Portal working decision

Portal work must not wait for a future Trading System journal to deliver useful
screens. Continue to use the already accepted current-data BFF/Manager and the
owner-approved **observation lane**: bounded/resumable Portal mirrors and
derived current-state views remain valid when their envelopes preserve actual
authority, freshness, coverage and derived labels.

Do not use this package to:

- start an authoritative EDS-09 Event consumer or source acknowledgement;
- present page deltas, current rows, change hints or observation mirrors as
  retained replay history;
- create a direct Trading System database/cache/broker/CLI path; or
- activate a route, profile, listener, service or command.

The authoritative Event/replay lane becomes eligible only after a later owner
return has an independently verified `EVENT_SOURCE_ACCEPTED` entry and its own
narrow activation evidence.

## 4. Independent validation from this Portal checkout

Run from the repository root:

```bash
(cd upgrade/backend/trading-system-owner-returns/eds09-current-source-return-v1 \
  && sha256sum --check RETURN_MANIFEST.sha256)

python3 -B services/portal-execution-edge-rs/tools/validate_eds08_source_continuity.py \
  --owner-return upgrade/backend/trading-system-owner-returns/eds09-current-source-return-v1/owner-return.v1.json
```

Expected results are a complete manifest check and:

```text
EDS-08 source continuity contract validation passed: 18 gaps, 7 owner lanes,
3 event classes, 8 synthetic cases plus owner return.
```

These checks read committed files only. They do not contact Trading System,
start a container, change a Portal route, or access any secret.

## 5. Portal-agent continuation prompt

```text
You are continuing Portal Execution work after the Trading System EDS-09
owner-return handoff. Read in this order:

1. upgrade/backend/EDS_09_TRADING_SYSTEM_OWNER_RETURN_HANDOFF.md
2. upgrade/backend/trading-system-owner-returns/eds09-current-source-return-v1/README.md
3. wire-contract.md, owner-return.v1.json, and acceptance/source-as-is-mapping.v1.json
4. upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md, EDS-08 and EDS-09
5. EDS_FRONTEND_DATA_CONTRACT_TRACKER.md, especially owner ruling OR-1.

Validate the mirrored package with its RETURN_MANIFEST.sha256 and the existing
EDS-08 validator. Treat all 18 gaps and all three Event classes as
SOURCE_GAP_CONFIRMED. Do not create an authoritative Event/replay consumer,
claim global ordering, or wait to improve useful current-data screens.

Continue the approved observation lane and maximum-current-data work using
existing typed Portal/Manager contracts, retaining source authority,
freshness, coverage, profile isolation and derived-data labels. Do not add
direct Trading System DB/Redis/broker/CLI access or activate runtime services.
```

## 6. Scope, rollback and provenance

This handoff changes only versioned documentation and static contract evidence.
It changes no Rust/TypeScript/Python runtime code, schema, route, credential,
image, service, cache, command, container or traffic. Rollback is a normal
revert of the Portal handoff commit. The source provenance is the Trading
System commit above; the Portal mirror must remain byte-identical to its
manifested package.
