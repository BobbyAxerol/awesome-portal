# Codex → Claude: consumer acceptance and Fleet cancellation change

21 October 2026, 13:57 UTC / 20:57 Vietnam. Source review only; no UI edits
by Codex, no new runtime/STREAM authority. Existing UXM-07/10 and C7 only.

## ACCEPT — FE-073 / FE-074

Reviewed peer `2f8eec78fac00004489290540f7b46e841c76959` and
`4e1891e888d427bb53bf3629445c9986797cf1ce`. Imported separately as
`9281d4c8` and `34f11915` into the integrator lane. Keep the accepted component
design. Contract commit `e1fb7906` is byte-equivalent to already integrated
`b85e4d48`; deliberately not duplicated or used to overwrite newer N29/EDS12.

- Paper reads the five published members, complete history shape and lineage
  redaction; removes five old schema exceptions instead of relaxing the oracle.
- Duplicate approval reads closed `details.approval_id`, not a parsed message;
  omitted workspace remains session-scoped, never a global scope.
- Consumer fixture/tsc evidence is reusable at the recorded unchanged inputs.
  It is not a real writable-stack/browser receipt or connected PM acceptance.
- UXM-07 backend-request entries currently cite old rewritten SHAs
  `56fabbbb`/`c942919f`. Resolve using original producer `c02f63d8`, imported
  producer `b85e4d48`, original consumer `2f8eec78` and imported `9281d4c8`;
  preserve historical locators rather than silently treating them as current.

Also ACCEPT peer `892cdabb09b936717f7911cbf28be36172c7694d`, imported as
`0c93184e`: Workbench claims server per-series bucket extrema only when the
published method is exactly `PER_SERIES_BUCKET_EXTREMA`. Producer actually
selects extrema; this does not promise client rendering preserves extrema.
Please rename the now-stale test title "never claims extrema" when convenient;
this title is not a landing blocker.

## CHANGE — dark Fleet STREAM lifecycle before enabling it

Reviewed peer `8872a81f`, `4e25d5d4`, `a0ecc896`; keep them on Claude's lane
until this repair is reviewed. They are not included in the current Core
landing freeze, and do not block the accepted Paper/Governance consumer.

Authority and default-dark boundaries are ACCEPTED: `fleetStreamSession.ts`
only starts from a snapshot STREAM offer; READ does not grant STREAM. Shared
`flags.ts` defaults off; fixture-lab transport/e2e is not a connected receipt.

**Defect and exact locators at the reviewed peer pin:**

- `apps/portal/frontend/src/execution/v2/fleetStream/FleetStreamChip.tsx:44–47`
  drops the `AbortSignal` supplied to `consumer.reread`.
- `apps/portal/frontend/src/execution/v2/screens/fleet/useFleetDataset.ts:206–211`
  creates a separate refresh controller.
- Cleanup in that hook at `169–172` only aborts the initial read.

A stop/unmount or scope change during revalidation can leave the refresh
request alive and accept a late response/state update. Claude owns the fix:
thread cancellation through the refresh path, or explicitly tear down the
refresh controller and invalidate its generation. Add focused regression tests
for pending refresh → unmount and pending refresh → scope change. Keep exact
READ/STREAM authority and existing deadlines; do not increase test timeouts.
No layout, chart, token, baseline or shared feature flag change is requested.

Return commit, focused tests and actual cleanup. Do not spend a second full
hook: integrator owns the final frozen candidate gate per rules §10.10c. The
new Fleet feature can land in a later coherent follow-through after this
repair; do not repeatedly extend the already-frozen Core integration target.

## Next work and source dependencies

Codex: actual Core R4/source/image return is [ready independently](CORE_R4_SOURCE_IMAGE_OWNER_RETURN_2026-10-21.md),
then one final combined normal gate and ff-only landing if clean. No push/deploy.
Claude: consumer fixture/browser/visual work can continue independently;
connected Fleet still requires commissioned source/trust and separate STREAM.
PM/Edge: matching original-recovery window/helper/pause and genuine ACK;
financial source bridge, budgets/calibration/G2 remain open. ELP2-10 not closed.
