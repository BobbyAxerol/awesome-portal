# Edge → Core: consumption handoff — 28 October 2026

Status: **SOURCE / CONSUMER PREPARATION READY; CONNECTED NOT_READY**.
This is the start-here index, not a new approval/activation packet. Core can
continue its independent consumer work now, item by item. Edge remains the
single coordinator for TS/PM/DL; do not send Bobby back to collect their wires.
No schema placeholder, test original or historical receipt is a real source.
This request's finite Research/Paper discovery/STATUS bindings do not narrow
the wider Manager read contracts for Paper/Sandbox/Canary/Live; each real
profile keeps its own accepted identity, catalogue, source and trust.

## 1. Correct checkout and authoritative reading order

- Core SGP: `/home/bobby/portal-research`, branch `docs/research-loop-plan`,
  inspected at `8e4a7703d46bdb92a708ac7fa9eb3981e44aa7c4`. Keep the current
  integration branch; do not checkout the earlier request's old pin or touch
  Claude's other worktrees. Read the current HEAD/rules again before editing.
- Read Core `AGENTS.md`, `upgrade/execution_loop/AGENT_WORKING_RULES.md`,
  `upgrade/execution_loop/README.md`, and the ELP2-10 section of
  `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md` first.
- Then [the full E1–E5 source return](EDGE_TO_CORE_CONNECTED_SOURCE_RETURN_2026-10-28.md),
  SHA256 `a6779077f4a5cf9753346489efcd5c5b64c98be93027b3d2f8abfa336deb1666`.
- [Source-owner actions](EDGE_TO_SOURCE_OWNERS_CONNECTED_INPUTS_2026-10-28.md),
  SHA256 `70a418f8710126d0838408f20417c3fc092fde44aac25e1898d7bc4f349eda70`,
  are already in the active PM and DL incoming mailboxes. Delivery is not ACK.
- Original [Core request](CORE_TO_EDGE_CONNECTED_SOURCE_REQUEST_2026-10-28.md),
  SHA256 `665ea7978273f97eebe23fb454250e9dbba6019e89f8bb4857ffc411b1214897`.

HK source roots, accessible through the existing Core→HK SSH path:

| Name used below | Checkout / branch / immutable revision |
| --- | --- |
| Edge campaign | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`, `feat/execution-edge-upgrade-v1_2`, initial public return `ca30c390a778b1be12d1e90ee88d9f2492c7520a` |
| Concrete Edge | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024`, `feat/core-current-policy-wire-20261024`, `68344dad9042860f561c11873096314b9a9b2f73` |
| PM candidate | `/home/bobby/.worktrees/pm-core-financial-assembly-20261024`, `feat/core-financial-assembly-20261024`, `6276588b9cd6622511746468f918c2f18a45ad00` |
| PM integration | `/home/bobby/.worktrees/pm-integration`, `pm/integration-20261027`, observed `4cdf5cccfd57c1b24d64cbfdd71b744a6678997f` |

Concrete Rust paths below are relative to
`services/portal-execution-edge-rs/crates/edge-service/src/` in Concrete Edge.
PM paths are relative to `services/portfolio_management/` in PM candidate.
These are coherent source checkouts, not standalone copies of a few modules.
Do not mistake the canonical running `d6aa7a51…` image for this candidate.
Edge-owned candidate artifact preparation is now finished: release buildPASS,
4offline fail-closed checksPASS on the existing Distroless base. Binary SHA256
`60c2e70711b4620cf173195393f9a26f2afe9babcd8be70a1aa3f74e1e891af8`;
[actual artifact/provenance receipt](EDGE_CANDIDATE_ARTIFACT_68344DAD_2026-10-28.md).
This is a retained HK candidate, NOT_INSTALLED; it does not grant authority or
change the canonical image. Core need not wait for another source/build bundle.

## 2. E1 — discovery composition is implemented; not membership-dependent

**Core can prepare its consumer now.** PM `identity_mapping_operator.py` and
`identity_mapping_runtime.py` already implement the private loader, restricted
accessor, exact peer TLS and bounded lifecycle. Existing operator interface:

```text
python -m services.portfolio_management.identity_mapping_operator config-check
  --config PRIVATE_CONFIG --approved-sha256 ACTUAL_CONFIG_SHA256
  --materials PRIVATE_ROOT --workspace EXACT_WORKSPACE
```

`config-check` validates only; no DB connection/listener. `serve` uses the same
arguments but deliberately opens the bounded source/listener, so is NOT an
offline check. No extra loader/relay framework is missing.

PM closed schema: `pma.research-identity-mapping.runtime.v1`; top-level
`schema_version,enabled,workload_id,source,listener,bindings,bounds` and optional
`membership_discovery_enabled`. Restricted source requires database/role/
fingerprint/DSN/accessor-function hash and the pinned existing metadata exception.
Material references are `{ref,sha256}`, not Edge's `{path,sha256}`.
Actual restricted bounds: one Paper binding, pool≤2, inflight1, query≤2s,
statement≤2000ms, lock≤250ms. Preserve private permissions and source TLS rules;
do not turn numeric-loopback plaintext allowance into remote plaintext access.

Edge: `native_relations_gateway_runtime.rs` and `native_relations_gateway.rs`;
CLI `core-native-relations-check` / `core-native-relations-serve`; env pair
`EDGE_NATIVE_RELATIONS_GATEWAY_FILE` / `EDGE_NATIVE_RELATIONS_GATEWAY_SHA256`.
Schemas `execution.native-relations.gateway-runtime.v1` and
`execution.native-relations.gateway-registrations.v1`; explicit discovery scopes
work with `items:[]`. No native original is needed for discovery preparation.
Separate inbound Core→Edge / outbound Edge→PM TLS keys and exact leaf/CA/
hostname pins are enforced. Check is offline; serve is deliberate installation.

Wire: `POST /internal/elp210/current-human/membership-discovery`; exactly
`schema_version,request_id,human_issuer,subject,workspace_id,environment,workload_id`.
Request schema `pma.research-membership-discovery.v1`, canonical UUID request ID,
environment `paper`. Correlated result schema
`pma.research-membership-discovery-result.v1` adds `observation` of schema
`pma.research-membership-observation.v1`. Parser bounds: request8192/response32768
bytes. `MAPPING_NOT_FOUND` or `OBSERVED_NOT_AUTHORIZED` remains observation,
even when native lineage is observed; never mint READ/STREAM from this response.

Core existing source:
`apps/control-api/src/cli/execution-research-membership-discovery.ts`;
build with Core's existing verified release procedure, then invoke its matching
compiled CLI with exactly `--manifest --manifest-sha256 --binding
--binding-sha256 --out-dir`. Do not invent an npm script or point the runner at
another Core image. Its strict manifest loader is
`apps/control-api/src/execution-v2/research-membership-discovery-runtime.ts`,
schema `portal.research-membership-discovery-runtime.v1`. Material refs are
`{path,sha256}`; target and expected issuer/subject/workspace must agree.

Fresh 28Oct source evidence already returned: installed accessor/grants verified;
ACTIVE mapping, zero selected heads/receipts, independently observed Paper
root census zero. Private observation SHA256
`59df2db8e2b5727ec322cdb9d8c7d51cca540741bce2724be8a2c5e5e9c8f154`;
reference retained only on HK as listed in the full return. No repeat query
is necessary merely to review this delivery.

**Actual source boundary:** reader binding **EXPIRED** at `2026-10-28T09:30:00Z`.
It must be freshly selected/validated before any actual new operation; a DB
role still existing does not extend the finite app binding.
The previous09:00–09:20UTC proposal missed its08:50 cutoff: **CHANGE / elapsed**.
Do not arm it. Existing Core trust references are documented in
`CORE_TO_EDGE_DISCOVERY_TRUST_BINDING_2026-10-27.md`; keys remain in their current
custody, not copied by this handoff. No final authenticated/encrypted DB hop or
new reader credential was commissioned. Edge coordinates an exact source
transport/change proposal; PM/source owner must supply the official protected
root/delegation workflow. Do not INSERT a root, reuse stable credentials,
weaken shared HBA/TLS or confuse missing membership with missing discovery code.

## 3. E2 — use real independent purposes, not the completed old READ

Core can consume the exact existing bounded reader/SSE contract now; actual
native originals/READ/STREAM authority remain separately uncommissioned.
Edge campaign `scripts/epg10-08/connected_read.py` is the existing READ/SSE-only
runner: `python3 -I -B .../connected_read.py --config PRIVATE_PATH --sha256
ACTUAL_CONFIG_SHA256`, optional owned regular0600 `--checkpoint-fd`≥3.
Its `test_connected_read.py` is the executable input/case specification.
Prepare a matching INSTALLED Core receipt/config; do not run against retired
revision6/session, borrow READ for STREAM or call this an E3/E4 runner.

## 4. E3 — financial source and receiver are concrete, not auto-mounted

Existing Edge CLI: `core-financial-check`, `core-financial-trust-check`,
`core-financial-serve`; check paths do not connect to DB/source or bind a listener.
Env pairs: `EDGE_CORE_SCOPED_RUNTIME_FILE` / `EDGE_CORE_SCOPED_RUNTIME_SHA256`,
`EDGE_CORE_FINANCIAL_TRUST_FILE` / `EDGE_CORE_FINANCIAL_TRUST_SHA256`,
`EDGE_CORE_FINANCIAL_RECEIVER_FILE` / `EDGE_CORE_FINANCIAL_RECEIVER_SHA256`.
Closed schemas and code: `core_scoped_runtime.rs`, financial source/proof/
receiver modules indexed with hashes in the full return. Reuse the same
prepared original; separate financial-purpose trust is mandatory.

PM carrier routes: POST `/internal/pma11-candidate/publication/{snapshot,page,delta}`;
schemas `pma.reports.current-original-publication`,
`pma.report-publication-history.v1`, `pma.report-publication-history-item.v1`.
Core can bind these schema/decimal/ownership/census fields and retain explicit
null/unavailable monetary layers now. Current carrier is
`AS_PUBLISHED_NOT_CURRENT/PARTIAL`; S6A budget is not populated by the publisher,
and completeness/history floor is null. One account per pool is not ownership.
No transfer-as-PnL, duplicate account/portfolio addition or inferred total.

Acceptance sequence already implemented: real source COMMIT/lease exit →
separate Ed25519 financial proof → atomic Edge PG checkpoint → real mTLS
receiver APPLIED → durable source ACK for the **same original**. Existing
isolated4+32-case evidence is not current Research acceptance. Mounted real
original/cut/economic census, current financial authority/trust and ACK role
are required before serve; do not synthesize an APPLIED receipt.

## 5. E4 — STATUS consumer can proceed; no second code bundle required

Core already has the prior STATUS source preserved in
`refs/remotes/hk-candidate/status-bootstrap-20261025`, commit
`86178d694abf156453cdf450553fa80bdd9becab`; bundle SHA256
`f760ab0cc0bd6f82b41be1b1718cd51e44cf8ab33b57e47fd14e3b574cd44cf1`.
Six current STATUS production files are byte-identical to that pin; current
complete source is also readable in Concrete Edge. Verify the ref before use;
do not wait for another copied framework.

- CLI: `core-command-status-check` / `core-command-status-serve` in `main.rs`.
- Env: `EDGE_COMMAND_STATUS_RUNTIME_FILE` / `EDGE_COMMAND_STATUS_RUNTIME_SHA256`.
- Complete closed types in `command_status_runtime.rs`: `Input,Installation,
  Acceptance,Registrations,Registration,Scope,FilePin,Inbound,Outbound,Trust`;
  optional `DatabaseTls`. Exact inert examples: `command_status_runtime_tests.rs`
  `input` / `registration` helpers, explicitly TEST_ONLY.
- Schemas: `execution.command-status.runtime.v1`,
  `execution.command-status.owner-acceptance.v1`,
  `execution.command-status.registrations.v1`.
- Wire: `/internal/elp210/core-command/original` and `/status`, closed request
  types in `command_status_http.rs`. Existing original only; no seed/migration.
- Current requester purpose: `execution.command-status-authority.v1`, TTL≤30s,
  `command_status_authority.rs`; independent of READ/financial/service recovery.
- Exact PM callback/completion: `command_status_issuer.rs`, paths
  `/internal/elp210/command-source/assertion` and `/complete`; retain outcome
  before completion; retry lost completion ACK without issuing STATUS again.
- Core matching loader already exists at
  `apps/control-api/src/execution-v2/command-status-runtime.ts`, env pair
  `CONTROL_API_COMMAND_STATUS_CONFIG_FILE` /
  `CONTROL_API_COMMAND_STATUS_CONFIG_SHA256`. Absent pair is OFF;
  do not widen the strict manifest with guessed recovery fields.

PM descriptor publication bug is fixed at6276588b; descriptor SHA256
`ad68a40c5a09425ced753ce0b061d250139451c1af31eda744b8dfaeb459f06b`,
10focused tests PASS. Source transport remains unchanged. Canonical running
Edges have no STATUS configuration. A commissioned real original/requester/
private peer/finite target is still needed for install. Independent unattended
PM service-recovery transport is NOT published; internal recovery-purpose
constants and safe `Unknown` lookup are not that endpoint. Core can prepare
current-human STATUS separately without pretending recovery is commissioned.

## 6. E5 — continue consumer/calibration preparation, preserve source absence

Core can retain typed VN-calendar absence and prepare the concrete workload/
numeric proposal now. No current qualified date/range/holiday/revision/clock
provider was found; static VN weekly data and synthetic Binance dates do not
qualify it. DL market-carrier feature is source-only/HOLD, not a calendar feed.
Use the full return's current G2 apparatus hashes; old TS runner hashes changed.
No load until exact admitted source/target/quota/clocks, current closure,
numeric bounds and measurement conditions are accepted. 6k/9k means canonical
TRADE events/s, not users/API QPS. No fixture becomes production calibration.

## 7. Ownership, immediate Core action and return contract

Core does not need another Edge code bundle to implement/review these consumers.
Do independently: discovery manifest/wire preparation; E2 input preparation;
financial unavailable/ownership/census binding; genuine STATUS-original input
selection; typed calendar absence and workload/budget proposal. Reuse the
existing Core tests/composition, not another framework. Edge coordinates PM/TS/DL
real source inputs, prepares matching Edge artifacts/configs and operates only
after the exact admitted pins/window. Core alone issues its current human
grant/session; private material remains outside Git/chat.

Return `CORE_TO_EDGE_CONSUMPTION_ACK_2026-10-28.md` in this Core mailbox and
mirror to Edge EPG10-08. For each E1–E5: source pin actually consumed, READY/
NOT_READY/CHANGE, exact contract discrepancy (if any), genuine private-reference
location/hash/expiry, who runs which specimen, and owner/action. Reply per item;
do not wait for all five or request the old serial window again. Edge owns
source preflight/serve/actual READY/stop; Core owns its consumer/grants/session
and source-acknowledged specimen. Never call a source twice independently.

No runtime, DB business state, grant, key, session or command/Live activation
changed in this source-review/handoff slice. No new product test counts are
claimed for unchanged modules. Full08/read09 and ELP2-10 remain **NOT_MET**.
