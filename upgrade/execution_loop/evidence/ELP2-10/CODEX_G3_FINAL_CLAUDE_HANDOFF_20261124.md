# G3 — consolidated return to Claude

## Scope and exact starting point

Owner request: finish independently runnable G3 backend and return the whole
package to Claude. This file is the consumer/integration entry point, not a
new request ledger or an acknowledgement from Claude. Read the
[source receipt](CODEX_G3_IMPLEMENTATION_20261124.md#final-source-return) and
`CODEX_CLAUDE_BACKEND_CONTINUATION_PLAN_20261124.md` in the historical Research
mailbox for the surrounding G1–G7 work.

- Implementation worktree: `/home/bobby/portal-t3-core-20261122`, branch
  `integrate/v13-candidate-20261122`, common repository `/home/bobby/portal`.
- G3 authority/producer/profile source: `d402a594e28984498b9d36efbe90599ac7d9c394`;
  source receipt/indices: `974b0435b01cde76a8296c081b937b34bcf64402`.
- Research mailbox: `/home/bobby/portal-research`, `docs/research-loop-plan`.
  It receives explicit documentation mirrors, not a whole-history merge of
  the old Research branch into the v1.3 source lane.
- Preserve Claude's original Access/Observed worktrees and WIP. Start the
  consumer slice from the verified v1.3 source checkpoint; do not merge the
  old Access/Observed implementation again or reset either worktree.
- No runtime install, grant issuance, command/Live activation, push or change
  to dev/main/stable was performed by this handoff. No UI design was changed.

## 1. Delivered backend and contracts — do not reimplement

| Area | Existing implementation / boundary |
| --- | --- |
| Ordinary authority | `ordinary-profile-authority.ts`, contract/intake/controller and migration159; real coordinator, transactional DB CAS, immutable history, replay, target binding |
| Delegation | Protected owner ceiling; administrator delegates READ to a child within one current parent; child cannot delegate; parent revoke, DENY, session/expiry and final confirmation enforced |
| Installation | Private hash-pinned root intake, no HTTP installer or environment toggle; optional private AppModule composition only; legacy workspace policy is not switched |
| Profile selection | Explicit scalar `profile_id`; exact workspace/environment/profile registry and aggregate budget; two Paper profiles stay separate; omitted profile selects the pinned default |
| ALL and historical work | ALLv1 still means three environment defaults, not a four-profile union; ALL+profile refuses; registry-backed historical calculation work refuses pending its own accounting |
| Source seam | Proposed signed normalized factory plus paired provenance; not an accepted Edge wire, installed source, or permission to stamp legacy pages qualified |
| Restore | Separate versioned ordinary qualification is the active follow-through below; old inventories may not silently omit ordinary authority |

Canonical public contracts: `execution-ordinary-profile-authority.d.ts`,
`execution-manager-models.d.ts`, `execution-manager-series.d.ts` under
`packages/contracts/generated/`. Canonical vectors:
`execution-ordinary-profile-authority.synthetic.valid.json`,
`execution-manager-profile-selection.synthetic.valid.json`,
`execution-manager-series-query.synthetic.valid.json` under
`packages/contracts/fixtures/`. Existing source receipt records actual tests,
scope and limitations; test counts are not additive across retakes.

## 2. Claude consumer work — preserve the approved design

The API emits selected `profile_id` on concrete responses even if the request
omitted it. Current closed frontend parsers reject that additional field.
**Do not roll out this API before consumer compatibility is verified.**
Treat `profile_id` as the exact opaque registered identifier; do not construct
it from an environment, venue label or artifact profile-key/version.

1. `readers/managerDataset.ts`: accept optional scalar `profile_id` in
   `ROOT_OPTIONAL`, expose `profileId`; preserve all old checks/old body support.
2. `readers/managerSeries.ts`: separate optional keys from keys required by
   `hasAll`; accept optional `profile_id`. Thread query type, encoder and
   `seriesAnswersQuery` together; do not weaken strict unknown-field checks.
3. `api/managerDatasetQuery.ts`, `ports.ts`, `httpApi.ts`, `fixtureApi.ts`:
   propagate `profileId`, reject requested/returned profile or workspace
   mismatch and ALL+profile. Omission remains the server-pinned default.
4. `screens/fleet/fleetDatasetModel.ts`: add profile identity to `DatasetFilters`
   and `datasetQuery`. Its JSON-based `datasetKey` then includes that identity.
   `screens/fleet/useFleetDataset.ts` **also has the publication probe**:
   `useDatasetPublication` currently keys/requests only environment. Thread
   workspace/profile through that probe and its callers, not only row paging.
5. Preserve cursor/request identity and abort stale responses when switching
   Paper A→B. Series already keys `JSON.stringify(query)`; the HTTP shared read
   cache already keys full URLs. Correct query propagation is required; a broad
   cache rewrite or client union of Paper profiles is not.
6. Tests: old/new bodies, omitted default, explicit profile/workspace mismatch,
   ALL refusal, cursor separation, revoke and A pending while B is selected.
   Use the canonical fixtures through existing reader ports. No layout, colour,
   typography, component, baseline or fixture-warning banner changes are needed.

Administrative contracts do not assign a new admin screen. If separately
composed, own-password ACCESS_ADMIN step-up and same-origin/CSRF are required;
write `operation_id` equals the idempotency header and CAS uses current head.
Do not request the owner's password or infer STREAM/HISTORY/write from READ.

## 3. Source-as-is clarification — not all remaining work belongs to Edge

The owner-approved ordinary design allows an owner-commissioned, Edge-pinned,
Core-observed compatible adapter. A new TS signing mechanism is **not mandatory**.
The G3 Ed25519 carrier is one proposal, not a requirement already accepted by Edge.
Do not require Edge to resend the three known physical pin triples in
`access-profile-pins.ts` (OKX, Paper Binance, Sandbox).

Latest local public returns are
`CORE_REQUEST_TS_EDGE_REMAINING_GAPS_20261123.md` and
`CORE_REPLY_TO_TS_ANSWERS_20261123.md` in the Research mailbox. They report
21/21 relations on each Paper, 15/15 Sandbox and 17/17 Live. These are reported
23-Nov observations, not a fresh runtime qualification by this turn.
Those delivered bounded relation families do not establish a delivered
normalized `alpha_fleet_overview` or complete correlated Fleet population.
`command_journal` PARTIAL is Core's ladder draining, not an absent Edge export.
True-empty OKX relations and already delivered pins must not be requested again.

**Core implementation still owned:** `paper-read/manager-records.ts` discards
raw metadata while the existing Manager envelope can contain physical
`catalogue_sha256`; `execution/profile-projection.worker.ts` writes the legacy
catalogue constant into its projection lineage. That Core-authored legacy seal
is not proof of the physical source pins. For a source-as-is producer, preserve
and validate the genuine per-profile metadata/evidence in a bounded private
carrier, bind exact local snapshot/committed head and register the producer/
publication as an inseparable provenance pair. Do not replace this with a
boolean `verify => true` or relabel old snapshots with new catalogue hashes.
This wiring is not implemented or qualified by the signed-factory tests.

**Single remaining Edge clarification, OKX first:** point Core to the existing
authoritative export/schema and sanitized example for Fleet member tuples,
owner/binding/assignment revisions, complete population at a defined cut,
currentness and rebuild semantics. Supply only deltas to existing pins and
public commissioning proof locators; identify genuinely unavailable fields
rather than inventing them. Live additionally needs its missing physical
profile-selection artifact; this does not block the other three profiles.
Economic ownership/valuation proof is needed only for the financial facts
being published; identity-only Fleet need not wait for money/Score/series.

Coordination is pull-only via the Research ELP2-10 mailbox and the established
Claude remote channel, not repeated SSH polling. This file is locally published;
without a channel delivery/receipt, do not claim Edge or Claude has received it.
No secret, session, token, credential or private key belongs in the return.

## 4. Acceptance and return expected from Claude

Return separate dispositions, each with exact source SHA/test receipt:

- `CONSUMER_COMPATIBILITY`: ACCEPTED or CHANGES_REQUESTED for section2.
- `PRODUCER_SOURCE_BINDING`: existing exported capability, exact evidence and
  remaining Core mapping, or precise missing source field/owner/action.
- `RESTORE_ORDINARY`: result pinned to the ordinary follow-through receipt,
  explicitly distinct from full V2/native cutover and connected acceptance.
- `RUNTIME_AND_BROWSER`: NOT_RUN until exact private composition/backup/schema,
  compatible frontend and real-source commissioning are approved and installed.

No acknowledgement is inferred from this file. Full G3 and ELP2-10/11 remain
OPEN while mandatory source/consumer/connected gates are open. G4 can continue
only within its assigned scope, reusing existing batch/reader/reducer code;
this return neither opens a new phase nor duplicates the original task ledger.

## 5. Follow-through evidence

Actual four-stage ordinary PostgreSQL drill completed **exit0**:
**7 unique tests PASS** (SEED1, CHECK_COPY4, POST_SNAPSHOT1, VERIFY_STALE1).
Tests belonging to the other runner phases are intentionally filtered per
invocation, not counted repeatedly as new coverage. Real migrations through159,
official install/delegate/revoke and actual `pg_dump`/`pg_restore` were used in
two disposable clusters; scripted empty C2 inventory tables are not C2 barrier
qualification.

After a genuine post-snapshot parent revoke, the source refuses child READ and
the independent journal advances. Renaming the old dump clone back to the
**same original DB name/cluster/role** makes the old ordinary reader allow
again, while the new independent latest-checkpoint verifier refuses it. This
proves mismatch detection, not runtime prevention by an installed DR fence.
The overlay is UNMOUNTED and a match remains `MATCH_NOT_CUTOVER`.

The unchanged normal hook remains pinned to prior source tree
`6930a1892e891ee54b6a63e53fc8885216185729`; it does not cover this new code.
Final legacy PG10/10 and pure21/21 retakes completed exit0. Whole Core
typecheck completed **exit0 for both projects**; exact logs/hashes and cleanup
are in the implementation receipt. Source pin follows in the R0 source return.

## 6. Ready-to-assign continuation — no new design campaign

Claude can take section2 immediately on a slice from the source checkpoint
recorded below, preserving existing Access/Observed WIP. In parallel, implement
the Core-owned metadata preservation/validation seam in section3 immediately.
Complete normalized producer mapping and binding only after the existing
export locator and its exact semantics are confirmed; do not assume the
required export already exists or invent revisions. Request only the precise
missing source semantics through the established Edge mailbox, without
requiring a new wire when a compatible export exists. Do not make parser compatibility wait for that
producer, or identity-only Fleet wait for financial/Score inputs.

For each return, report changed paths, exact source/tree, focused tests and
remaining owner/action. Keep consumer ACK separate from backend delivery and
real-source qualification. Reuse the old normal-hook receipt only for unchanged
code; run one normal hook on the reconciled consumer/restore candidate before
landing or installation. The present follow-through is an intermediate R1
source checkpoint under campaign§10.10c, not a new R2 landing or deployment.

Restore continuation is specifically bounded: the independent checkpoint
comparison is UNMOUNTED and returns `MATCH_NOT_CUTOVER`. It does not install an
independent nonrollbackable floor, freeze old holders/HTTP delivery, reconcile
source terminals/ACKs, or authorize cutover. Those existing C2 barriers and
their exact commissioned inputs remain required; never mount this verifier as
a replacement for them.
