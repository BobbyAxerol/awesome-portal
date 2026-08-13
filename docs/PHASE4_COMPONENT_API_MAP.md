# Phase 4 component & API handoff

This map is the refinement boundary for Roadmap & Task Board. It lets a UI/UX
pass improve presentation without weakening persistence or content contracts.

## Responsibility map

| Layer | Owns | Must not own |
| --- | --- | --- |
| `features/tasks/TaskBoardFeature.tsx` | Board/table/editor interaction, filters, drag affordance, user feedback. | Fetch shapes, SQLite semantics, direct localStorage writes. |
| `features/tasks/useTasks.ts` | Local fallback, feature flag choice, versioned server mutation, conflict/error state. | Layout/colours or document content. |
| `features/roadmap/RoadmapFeature.tsx` | Timeline/editor interaction and accessibility. | Server IDs or API transport details. |
| `features/roadmap/useRoadmap.ts` | Local fallback, V1 CRUD/version handling and explicit initialization. | Visual styling. |
| `lib/api.ts` | Typed HTTP paths, error envelope and request serialization. | React state or business copy. |
| `components/ui.tsx` + `styles/*.css` | Reusable primitives and token-only visual language. | Domain persistence decisions. |
| `backend/app/*` | Validation, transaction, audit, outbox, migration and operational safety. | Browser-local UI state. |

## UX invariants for a refinement pass

1. Keep the **sync notice** visible. It tells a manager whether they are in
   Local, compatibility API, or audited V1 mode, and gives a safe Refresh path.
2. When V1 database is empty, preserve the explicit **Initialize server from
   local** decision. Never auto-upload localStorage after route load.
3. A `409 version_conflict` must remain actionable: show the server conflict,
   retain the user’s draft until they choose Refresh, and never silently retry
   a stale mutation.
4. Task status remains a command (`transition`/`move`), not a generic PATCH.
   Roadmap IDs remain disabled for an existing V1 phase so activity anchors do
   not break.
5. Keep all original localStorage keys and legacy API fallback. UI polish must
   not make static/local use slower or require backend availability.
6. Use semantic tokens only; do not add raw colours, a component framework or
   animation that ignores `prefers-reduced-motion`.
7. Do not touch raw document/Mermaid fragments or the source-integrity tests.

## Performance posture

- No polling loop: sync occurs on route mount, deliberate Refresh, or after a
  mutation that changes neighbours' versions (move/delete).
- `App.tsx` lazy-loads every route feature, so a manager opening the board does
  not download raw docs/reports/mockup modules first.
- `content/doc-nav.ts` reads only the integrity manifest for sidebar labels;
  byte-preserved document HTML is deferred with `DocsFeature`.
- V1 fetches one collection only when required to refresh concurrent ordering;
  ordinary field PATCH updates the in-memory record directly.
- Filtered board data is memoized; render components receive plain domain data,
  not backend snapshots.
- Discord delivery happens outside the request transaction; a slow webhook
  never blocks the manager’s save interaction.

## Safe UI additions

Good next refinements: skeleton state for first load, activity timeline drawer,
keyboard reorder alternative to drag/drop, unsaved-draft conflict panel and
responsive filter disclosure. Add test IDs and Vitest coverage beside the
feature; preserve existing `data-testid` values used by contract tests.
