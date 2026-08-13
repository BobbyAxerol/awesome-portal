# Phase 3 component map

Phase 3 uses a strangler boundary: the immutable content fragments and seed values remain in their generated modules, while interactive behavior is provided by typed React features. Nothing in `legacy/portal.html`, `frontend/src/content/pages/`, `frontend/src/content/views.ts`, or `frontend/src/content/seed.ts` is edited by this phase.

| Legacy selector / source | Phase 3 module | Runtime test hook | Compatibility boundary |
| --- | --- | --- | --- |
| `#view-docs [data-page-id]` / `content/pages/*` | `features/docs/DocsFeature.tsx` | `docs-feature`, `doc-page-<page-id>` | Page markup is injected directly from the locked fragment. |
| `#view-roadmap` / `ROADMAP_PHASES_SEED` | `features/roadmap/RoadmapFeature.tsx` | `roadmap-feature`, `roadmap-phase-<id>` | Uses `quantPortalPhasesV1`; API remains `api/roadmap`. |
| `#view-board` / `BASE_TASKS_SEED` | `features/tasks/TaskBoardFeature.tsx` | `task-board-feature`, `task-column-<status>`, `task-card-<id>` | Uses `quantPortalTasksV1` and `quantBoardViewV1`; API remains `api/tasks`. |
| `#view-reports` / `VIEW_PANELS.view-reports` | `features/reports/ReportsFeature.tsx` | `reports-feature`, `raw-view-reports` | Reports is the default route and renders its locked raw fragment unchanged. |
| `#view-evidence` / `VIEW_PANELS.view-evidence` | `features/evidence/EvidenceFeature.tsx` | `raw-view-evidence` | Renders the locked raw fragment unchanged. |
| `#view-portal` / `VIEW_PANELS.view-portal` | `features/manager/ManagerPortalFeature.tsx` | `raw-view-portal` | Embedded mockup only; it is not a deployable service or control plane. |
| No legacy selector | `features/interpretation/InterpretationFeature.tsx` | `interpretation-feature` | Lazy route `#view=interpretation`; no iframe; legacy Reports remains default. |

## Runtime contracts

- The top bar remains exactly Docs, Roadmap, Board, Reports, Evidence. Portal is available only under Settings; Interpretation is adjacent to Reports, never a sixth top tab.
- `quantPortalTheme`, `quantPortalTasksV1`, `quantPortalPhasesV1`, and `quantBoardViewV1` retain their existing names and JSON shape.
- Mermaid sources are captured from the DOM before rendering and restored on theme change. The source content itself remains unchanged.
- Node is pinned to 22 via `frontend/.nvmrc` and `package.json` engines. On this Ubuntu host, use the `node:22-bookworm` Docker image for `npm ci`, tests, and builds; Tailwind is intentionally not introduced because this codebase has a token-based CSS system already.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build` from `frontend/`. The integrity suites hash every raw document/page, raw view panel, and seed count against the generated contract manifests.
