# P03 schema and authorization boundary

## Scope and authority

P03 has one authority chain:

```text
existing authenticated Portal principal
  -> existing workspace_members(workspace_id, user_id)
  -> one bounded transaction
  -> SET LOCAL ROLE portal_research_runtime
  -> research.* metadata only
```

There is no Research password, browser-selected workspace fallback,
`localStorage` authority, direct Trading System connection, separate pool, or
write access to an Execution-owned table.

`portal_research_runtime` is `NOLOGIN`, `NOINHERIT`, non-superuser. It may read
only `portal_users`, `workspaces` and `workspace_members` in `public`, and may
read/insert `research.*`; its only updates are the exact CAS columns on
`attempts` and actor-local `inspection_states`. It is not granted delete/alter
authority or any Execution-table DML. Every repository call sets statement, lock and
idle-in-transaction budgets locally, verifies membership before a Research
row is accessed, and writes an immutable audit record for durable mutations.

## Durable graph

The additive `research` schema carries the identities needed by later phases:

- `alphas`, immutable `alpha_versions`, bounded `import_sessions`;
- `attempts` and exactly one `PRIMARY` `runs` row per durable client intent;
- `jobs` and per-worker retry rows (`worker_attempts`) without converting a
  technical retry into a new Research attempt;
- `input_bindings`, `studies`, `trial_index`, `selection_records` and
  `evaluations` with run/study/trial composite foreign keys;
- append-only `exposure_facts` and `audit_log`; sealed `artifacts` and
  `release_candidates`; actor-local `inspection_states`; and `command_dedup`.

Selections, evidence, release candidates and evaluations are bound to their
own run through composite relationships. A nullable `selected_trial_id` is
allowed only for `CENTROID` or `COMPOSITE_POLICY`; it is never converted to
`0`. `COMPLETE`, `PRUNED`, `FAILED`, feasibility and selection remain separate
facts.

The server also enforces the pieces that must not depend on caller behavior:

- unique `(workspace_id, client_intent_id)` plus immutable payload check for
  idempotency;
- optimistic `draft_revision` compare-and-swap for autosaves;
- bounded library cursor index `(workspace_id, created_at DESC, run_id DESC)`;
- immutable alpha-version identity and append-only exposure/audit triggers;
- no cascade path from an attempt through run to sealed evidence; and
- bounded in-process admission: at most four concurrent Research metadata
  transactions, twelve queued, then typed `RESEARCH_ADMISSION_SATURATED`.

## Explicit non-claims

P03 contains no actual QuantBT/Delta output, no immutable snapshot reader, no
artifact bytes, no scheduler/worker claim loop, no Research BFF endpoint and
no browser state. Those are future phase responsibilities, not missing P03
implementation.
