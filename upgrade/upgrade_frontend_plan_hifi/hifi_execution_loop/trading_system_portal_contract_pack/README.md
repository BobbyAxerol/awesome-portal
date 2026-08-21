# trading_system_portal_contract_pack

Read-only evidence pack for the Portal backend team building `portal-execution-edge-rs`.

**Start here → [`CONNECTOR-CONTRACT.md`](CONNECTOR-CONTRACT.md).**

| | |
|---|---|
| Captured | Phase A–E 2026-08-20T10:50Z · **Phase F 2026-08-21T07:34Z** |
| Runtime | Execution Cell AWS HK, host `ip-172-31-16-126` |
| Gateway image | `tradingsystem-image:sha-8b88daa61e3` (`sha256:4f63dc9949f8…`) |
| `trading_system` HEAD | `9081397de9e981c43b4e0f67fabe747e7ed964c7` (detached, tag `v1.2.0`) |
| Mutations | **none** — see [`reports/PHASE-F.md`](reports/PHASE-F.md) §5 |
| Redaction gate | [`REDACTION-AUDIT.json`](REDACTION-AUDIT.json) — **PASS**, 70 files, 0 findings |

> The running gateway is **not** built from the checked-out git HEAD. Pin to the image
> digest, and re-run `scripts/00_runtime_identity.sh` before any deploy.

---

## Layout

```
CONNECTOR-CONTRACT.md      ← human entry point: every finding, with links
MANIFEST.sha256            ← sha256 of every file in the pack
REDACTION-AUDIT.json       ← handoff §9.1 checklist result

extract/                   ← MACHINE-READABLE. Generate the Rust client from here.
├── api-surface.json/.md       104 operations: auth, params, body fields, codes
├── request-contracts.json/.md request body per mutation (46/48; 2 take none)
├── payload-models.json/.md    85 models / 468 fields
├── response-shapes.json/.md   104/104 endpoints → ordered, typed field lists
├── serialization-contract.*   pg type → JSON wire type → Rust type
├── data-layer-contract.*      40 market-data + VN-calendar operations
├── db-schema.json             94 tables, 1291 columns, source ↔ live cross-check
├── event-catalog.json         schemas + literals + runtime aggregates
├── vocabularies.json/.md      22 enums, 91 DB CHECKs, venue matrix
├── error-catalog.json/.md     124 reason codes
├── cli-command-map.json/.md   64 CLI actions × access path
├── config-surface.json/.md    159 settings (17 secret-shaped redacted)
├── freshness-authority.json   thresholds, VN calendar, envelope mapping
├── runtime-probes.json        15 GET probes incl. the rejection contract
└── COVERAGE.json              handoff §7 → backing artifact

scripts/                   ← 17 read-only extractors; re-runnable, see CONNECTOR-CONTRACT §12
reports/                   ← PHASE-A..F, ASSESSMENT, DEEP-DIVE
evidence/                  ← raw read-only captures (phaseA, phaseB, phaseF)

openapi.sanitized.json     ← route-drift check ONLY (declares no params/bodies/security)
capabilities.sanitized.json, auth-contract.md, command-catalog.yaml,
event-catalog.yaml, db-schema-version.txt, workload-profile.md,
query-samples/, event-samples/, error-samples/   ← Phase A–E hand-written artifacts
```

`reports/PHASE-F.md` §3 lists ten corrections Phase F makes to the Phase A–E
artifacts. Where they disagree, **Phase F and `extract/` are authoritative** — those
claims are mechanically re-derivable, the earlier ones were hand-written.

---

## The five things most likely to surprise you

1. **The OpenAPI document cannot generate a client.** 0 query params, 0 request
   bodies, 2 component schemas, `securitySchemes: null`. Use `extract/`.
2. **`X-API-Key` is optional.** A known `alpha_id` alone authenticates 41 operations
   including order submission (`TS-GAP-008`). The Portal edge is the only real identity
   boundary.
3. **The event log is almost empty.** One event type at runtime (`ORDER_STATUS`),
   nothing since 2026-08-17, `copy:events:v1` never created. Project from `/v1/events`
   plus `synthetic_projection_events()` instead.
4. **The command journal runs but is switched off.** `ROLLOUT=OFF`, 430 rows, all
   `DEAD`. Its state machine is real; its runtime evidence is not.
5. **Retention is 90–730 days, not 1 day.** The earlier "1d" read a TimescaleDB
   schedule interval as a retention window.
6. **`numeric` arrives as a JSON string.** 63 columns — every price, quantity and PnL.
   Generating `f64` from the DB types fails on the first response. See
   `extract/serialization-contract.md`.
7. **Market data and the VN calendar are not in trading_system.** They live in
   `data_layer`, whose OpenAPI *is* codegen-ready. See `extract/data-layer-contract.md`.

---

## Verification

```bash
sha256sum -c MANIFEST.sha256          # every artifact
python3 scripts/98_redaction_audit.py # §9.1 gate; exits 1 on any finding
python3 scripts/99_assemble.py        # rebuild manifest + coverage
```

## Owner decisions still open

1. Portal service account + `gate:apikeys` allowlist entry
2. Read-only DB role for the optional adapter path (handoff §6.7)
3. Whether the `order-command.v2@2.0.0` shadow becomes authoritative
4. Live-mode connect window (currently HALTED, no live adapter connected)
5. Observability profile (loki/grafana) on or off

None block Portal design. All block Portal integration.
