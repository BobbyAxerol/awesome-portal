# Codex → Claude — N13B current-source UI handoff

Status: `BACKEND_BOUNDARY_ACCEPTED / PROFILE_RUNTIME_FLAGS_OFF`  
Date: 2026-08-29

## What Claude can integrate now

Use the same-origin Control API boundary only:

```text
/api/v1/execution/current-source/{environment}/screens/{screen_id}
/api/v1/execution/current-source/{environment}/screens/{screen_id}/sources/{source_id}/relations/{relation}
```

Valid environments are `paper`, `sandbox`, `live` and `canary`. Canary is
allowed only for `EXECUTION_CANARY_CONTROL_ROOM_SCREEN` and is explicitly a
Portal-governance join over Live facts.

The screen response is the authoritative inventory of capability/source
classification. Render exactly these states:

- `CONNECTED`;
- `DERIVED_FROM_EXISTING_SOURCE`;
- `SUPPORTED_BUT_NOT_ACTIVATED`;
- `SOURCE_DOES_NOT_CURRENTLY_EXIST`.

Errors may also carry `availability` and an owner `reason_code`. Keep the last
good result visibly stale if appropriate; do not replace an unavailable source
with zeroes or a fixture shown as live.

## UI rules for this phase

- Do not show source hashes, commit IDs, JWT/profile IDs or relation names in
  primary UI. Those belong in a restrained diagnostics drawer.
- Keep existing Portal control APIs for approvals, certification, incidents,
  activation and operations workflow; N13B does not duplicate them.
- An action capability marked `SUPPORTED_BUT_NOT_ACTIVATED` must be hidden or
  visibly unavailable with a recovery explanation. It must never be an enabled
  dead button.
- Paper/Sandbox/Live loading and failure states are independent. One profile
  failure must not blank sibling screens.
- Live can legitimately return an empty list. Render “No current records” with
  freshness/provenance, not sample rows.
- Do not switch registry `data_mode` from fixture/none until Codex reports the
  N14B screen-specific runtime gate passed.

## Claude parallel work before N14B

1. add typed clients for the two routes;
2. add fixtures for connected, derived, supported-dark, absent, empty-live,
   stale, denied and temporarily unavailable;
3. wire Paper screens behind their existing frontend delivery gate;
4. prepare Sandbox/Live/Canary states without claiming the profile is active;
5. run role, interaction, breakpoint, keyboard and visual regression gates.

Backend detail:
[`EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md`](../../backend/EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md).
