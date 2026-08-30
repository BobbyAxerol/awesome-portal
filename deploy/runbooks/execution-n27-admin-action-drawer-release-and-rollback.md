# N27 Admin Action Drawer Release and Rollback

Status: Portal implementation-qualified and source-command-dark. The Portal
publishes the exact operator task catalogue and governed blocked-plan path;
it does not claim that a source command transport or command identity exists.

## Boundary

The Drawer consumes `GET /api/v1/execution/commands/tasks` and never builds a
shell command, SQL statement, URL or free-form source payload. The response
contains exactly 24 tasks in six groups and maps the complete 64-entry owner
catalogue to one of:

- `CONNECTED` — terminal source verification is active;
- `SUPPORTED_BUT_INACTIVE` — an exact typed route exists but the Portal
  command identity/transport is not active; or
- `SEMANTICALLY_INCOMPATIBLE` — ambiguous, unpublished, direct Redis or
  destructive host semantics cannot be exposed safely.

The current accepted release contains zero `CONNECTED` operations. This is a
factual capability state, not hidden product debt. The UI must render inactive
or incompatible controls as explanatory disabled states; it must not render a
successful button or fabricate transcripts.

## Active Portal behavior

- session, workspace and ADMIN checks apply to every catalogue/task request;
- R0 `run` requests are rejected before source dispatch and append a bounded
  audit record containing only a parameter digest;
- mutation `plan` requests validate the per-task key allowlist, require a
  bounded reason and create an idempotent five-minute hash-only blocked plan;
- conflicting reuse of a request key returns typed HTTP 409;
- `apply` is always denied while command relay is disabled;
- no outbox message, credential, raw payload, transcript or source side
  effect is created.

## Future source activation gate

Changing one task to `CONNECTED` requires an owner-published exact command
identity, immutable route/schema revision, per-command environment/target
policy, step-up/SoD policy, idempotency or uncertainty semantics and an
authoritative terminal verify route. Activation is task-by-task and must pass
negative auth, timeout-after-dispatch, restart/replay, containment and audit
tests. HTTP 202 is never terminal success.

## Rollback

Remove/disable the Drawer task routes or revert the Control API image. Query,
projection and realtime remain unchanged. Because the current release never
dispatches source commands, rollback cannot leave an ambiguous source side
effect. Preserve Portal audit and blocked-plan rows for traceability.
