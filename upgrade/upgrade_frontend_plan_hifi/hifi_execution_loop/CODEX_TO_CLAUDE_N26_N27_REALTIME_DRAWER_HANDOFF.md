# Codex → Claude: N26 Realtime and N27 Admin Drawer handoff

## N26 browser contract

Use the same-origin snapshot and stream routes from
`realtime-manager-release-profile.v2.json`. The first response is
`execution.manager-realtime-snapshot.v2`; resume uses its exact
`{projection_epoch}:{projection_sequence}` cursor.

Client terminal behavior is mandatory:

- on `auth.expired`, call `EventSource.close()`, stop reconnecting and enter
  login/session-expired UX;
- on any `projection.gap` with `terminal=true`, call `close()`, fetch a new
  snapshot, then create a new EventSource only after the server-declared
  resnapshot time/jitter;
- do not reconnect a terminal event merely because native EventSource emits
  another `error`; and
- `auth.expiring` is non-terminal only while the Portal session remains valid;
  reconnecting through the BFF obtains a fresh delegated JWT.

Live `EMPTY_VALID` is a successful empty snapshot plus heartbeats. Do not add
fake rows or infer activity from heartbeat traffic. Do not show activation
manifest hashes in primary UI.

## N27 Drawer contract

Render the server catalogue from `GET /api/v1/execution/commands/tasks`; do not
retain a second hard-coded 21/24-task model. The current fixture contains 24
tasks in six groups and reports:

- 0 `CONNECTED`;
- 14 `SUPPORTED_BUT_INACTIVE`; and
- 10 `SEMANTICALLY_INCOMPATIBLE`.

Both inactive states are explanatory disabled controls. A 201 blocked plan is
not execution success; show its blockers and never create an Apply-success or
verify transcript locally. Only a future `CONNECTED` task with authoritative
terminal verification may enable its action. `PARTIAL`, HTTP 202 and
`UNCERTAIN` must never render green.

Build forms from `params`, registry and authority metadata. Never accept raw
shell, SQL, URL, credential or generic JSON fields. Emergency close remains
inactive and visibly requires typed confirm, step-up and two-person authority.

Backend report references:

- `upgrade/backend/EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md`;
- `upgrade/backend/EX_BE_30_N27_ADMIN_ACTION_DRAWER_COMMAND_PLANE.md`.

