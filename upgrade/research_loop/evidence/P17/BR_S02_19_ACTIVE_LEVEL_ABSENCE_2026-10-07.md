# BR-S02-19 — Position-bound SL/TP typed absence

UTC date: 2026-10-07. Owner: Codex/backend. Base: `e9c44b94` on
`codex/be-gaps`; land ff-only on `docs/research-loop-plan` after the normal
commit hook. Bobby requested this exact repair; Claude owns all UI changes.

## Source and scope

Read root AGENTS, Research A13 working rules, Unified's latest WEX addendum,
the WEX backend/Claude handoff and
`COMPLETE_WINDOW_EXECUTION_FRONTEND_2026-10-07.md` (finding BR-S02-19).
The finding is accepted: Bracket V4 retains 115 flat observations with
`active_stop = active_take_profit = "0"`, and 53 open-position observations
with genuine levels. These are account-active levels, not order intent prices.

Normalize **only the public observation DTO**. The source/ingress
`WindowExecutionRowSchema`, P05 bytes, batch/companion/manifest digests and
repository remain unchanged. No migration, engine/adapter change, child run,
reseal, private/source access, UI edit, runtime rollout or remote push.

## Delivered contract

Operation unchanged: `researchWindowObservationsGetV1`,
`GET /api/v1/quantbt/runs/{runId}/windows/observations`.
Generated file: `packages/contracts/generated/research-window-execution.d.ts`.
New named schemas: `WindowObservation`, `ActiveProtectionLevel`.
`WindowExecutionRow` references the public normalized observation, not ingress.

`payload.active_stop` / `active_take_profit` remain decimal-string-or-null.
Required `payload.active_level_availability` carries:

- `policy_id: POSITION_BOUND_POSITIVE_LEVEL_V1`
- `origin: PORTAL_NORMALIZED`
- `source_ref: RETAINED_WINDOW_OBSERVATION_PAYLOAD`
- one `{state, reason_code, source_value}` per level.

| Actual accepted position / source level | Public level | Typed state / reason |
|---|---|---|
| Flat, including signed/decimal zero | `null` | `NOT_APPLICABLE / POSITION_FLAT` |
| Open long or short, positive price | Exact original string | `AVAILABLE / null` |
| Open, source field absent | `null` | `NOT_PUBLISHED / SOURCE_FIELD_NOT_PUBLISHED` |
| Open, source zero sentinel | `null` | `NOT_APPLICABLE / ENGINE_ACTIVE_LEVEL_NOT_SET` |
| Open, source negative level | `null` | `NOT_PUBLISHED / SOURCE_ACTIVE_LEVEL_NON_POSITIVE` |

Sign/zero classification uses decimal string semantics, not floating-point
rounding. Flat stale-positive levels are not drawn, but remain disclosed in
`source_value`. Stop and take-profit are independent. Journal `stop_price`,
`take_profit_price`, limit/trigger/parent/OCO/fill facts are untouched.

Example flat read:

```json
{
  "active_stop": null,
  "active_take_profit": null,
  "active_level_availability": {
    "policy_id": "POSITION_BOUND_POSITIVE_LEVEL_V1",
    "origin": "PORTAL_NORMALIZED",
    "source_ref": "RETAINED_WINDOW_OBSERVATION_PAYLOAD",
    "active_stop": {"state": "NOT_APPLICABLE", "reason_code": "POSITION_FLAT", "source_value": "0"},
    "active_take_profit": {"state": "NOT_APPLICABLE", "reason_code": "POSITION_FLAT", "source_value": "0"}
  }
}
```

`revision` remains the **immutable source companion identity**, not a hash of
normalized response bytes. Observation cursors now also bind the normalization
policy: discard an old cursor and request the first page if it is refused.
Other operations' fingerprints do not change. Reads remain private/no-store,
actor/workspace/window/fold-bound, at most 200 rows / 1 MiB. Pending Holdout
protection and availability are unchanged.

## Tests and proof reuse

- Focused Control API: **21/21**, including 14 active-level cases and 7 existing
  read/ingress/cursor/availability cases. OpenAPI plus Zod validation, exact
  long/short/tiny decimal values, independent absence, false AVAILABLE
  rejection, source non-mutation and projection rejection at ingress.
- Focused published contract: **5/5**; generator deterministic, canonical
  synthetic public fixture, required typed disclosure and generated names.
- Control API build and frontend typecheck passed; the latter is the compatibility check;
  no consumer file is edited. Normal hook is the final commit/landing gate,
  not a separate manual full-suite rerun.
- Reuse the real accepted Bracket V4 run
  `rrun_c2329924a32a26e8d9d5bf9d5c1f809a`, from private
  `window-execution-20261007/bracket-qualified/observations-OOS.json`:
  **115 flat → null; 53 open → exact AVAILABLE levels**, all 168 rows validate
  and the source object digest is unchanged. Source file SHA-256:
  `ab1a25845487c32a4cca9d9d671078e80a25bffcfaf7b81fc3dbca91804ae128`.
  This is **accepted-source receipt projection readback**, not a new live API
  or product browser receipt. No engine rerun is needed for this mapper.

Reproduction: set `RESEARCH_ACTIVE_LEVEL_REAL_PAGE` to that private receipt
and run the two `research-window-{execution,active-levels}.spec.ts` suites.
Ordinary CI runs the synthetic regression suite without private data.

## Handoff to Claude

BR-S02-19 backend source is ready for the agreed clean preview rebuild.
Regenerate/consume the published types. Use the served `active_stop` and
`active_take_profit` directly; null breaks the step line. Use each field's
typed availability for disclosure. **Never draw `source_value`**: it is raw
provenance, not an active price. The existing defensive heuristic can remain
for an older-server fixture, but is no longer needed on the repaired read.

After rebuilding the current shared branch, confirm Bracket V4's 115 flat /
53 open rows on the real API and browser before the 73-cell matrix. No UI
redesign or baseline re-record is implied. Pending-run Holdout browser proof,
real Limit/OCO, S06 pruned/6400 and P24 matrix remain separate named FE gates;
this fix does not declare them PASS or claim release approval.

## C4

Read-only capacity: root 97 GiB free / 621 GiB (~15.6%); 10 GiB available RAM.
Docker snapshot: images83.8GB (262/25 active), containers51/47 active,
volumes115.5GB (88/21 active), cache186.4GB. Reclaimable bytes are not deletion
approval; all existing resources remain protected in this slice.
No image/runtime build or cleanup in this mapper slice. One required normal
hook uses the existing bounded disposable test cells and their teardown traps;
no business/source/backup volumes or current/rollback images are removed.
Slice cleanup: `NO_ACTION_NEEDED`; preserve the original real-source evidence.
Existing low-disk quiet maintenance remains a separate inventory-backed task.
