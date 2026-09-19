# Claude handoff — P03 backend foundation

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

P10 owns a generated browser consumer and named producer/read DTOs. P03's FE
review/checks are therefore `PENDING_OWNER_PHASE`, not a missing P03 UI task.
Preserve the approved HIFI composition and shared P01/P02 state semantics when
that work begins.
