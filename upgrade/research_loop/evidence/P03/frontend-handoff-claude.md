# Claude handoff — P03 backend foundation

> **Coordination amendment — 2026-09-20.** This handoff remains authoritative
> about P03's lack of a browser endpoint and its identity/authority boundary.
> Its earlier deferral language must not block HiFi composition now. Read the
> [P03–P06 contract-first vertical-slice brief](../../CLAUDE_P03_P06_VERTICAL_SLICE_RECOVERY_BRIEF.md)
> before implementing UI. It permits scoped state/panel composition, not a
> browser-owned identity, BFF invention or mutation.

P03 backend is complete, but there is intentionally **no browser endpoint or
generated client yet**. Do not create a fake Research login, a browser-owned
workspace selector, `localStorage` authority, or a UI that claims a run/job is
scheduled merely because P03 tables exist.

What is stable for later UI work:

- Scope is always the existing Portal authenticated actor and existing
  workspace membership; wrong-workspace objects must render the shared
  `denied` state, not empty or a different object.
- IDs are opaque strings; timestamps remain UTC; digests are lowercase
  SHA-256 strings; nullable `selected_trial_id` stays `null` rather than `0`.
- Draft conflict is typed `RESEARCH_DRAFT_REVISION_CONFLICT`; a full bounded
  admission queue is typed `RESEARCH_ADMISSION_SATURATED`; access failure is
  `RESEARCH_WORKSPACE_FORBIDDEN`.
- Inspection state is actor-local and must never mutate selection, sealed
  artifact or release-candidate information.

P10 owns a generated browser consumer and named producer/read DTOs. P03's
**activation** checks are therefore `PENDING_OWNER_PHASE`, not a license to
invent a client. The current recovery slice may nevertheless compose the
shared HIFI state boundary from the stable facts above; follow the linked brief
for that bounded work.
