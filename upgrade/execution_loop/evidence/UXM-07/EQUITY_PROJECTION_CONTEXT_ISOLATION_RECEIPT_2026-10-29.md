# R-C review item 1: context isolation of the equity projection hook (2026-10-29)

Codex finding: `useEquityProjection` kept the previous `ready` state and reset it in a passive effect, so a commit showed the old workspace/deployment/window output under the new props. Fixed on `claude/ft2-fe` (base `claude/slice-followthrough@9b9244ea6`). Lane: FIXTURE_LAB.

## The key

`projectionRequestKey(api, request)` = `JSON.stringify([identityOf(api.getEquityProjection), workspaceId, deploymentId, window, intent])`, and `null` (idle) unless `request.enabled === true`, a deployment is given and the port offers the method. `identityOf` is a stable small integer per function object (WeakMap), so a different port is a different request. The returned state is derived in render: `store.key === key ? store.state : loading` (`idle` for a null key). The effect only starts the read; a reply is written under the key it was asked for and only if its effect run is still live (a changed key, a disabled request or an unmount writes nothing). No setState resets what the render has already hidden. `enabled` is fail-closed (`=== true`), as `failClosed.test.ts` requires.

## Tests (commit level)

- `series/useEquityProjection.test.tsx` (15): a probe records the hook's return on every render, each record judged against its own context (bodies are stamped with workspace and window). Workspace, deployment, window and intent change: the first commit under the new context is `loading`, no commit shows the previous context's ready data; disable: `idle` in the same commit, re-enable starts from `loading`; another port: `loading`; key completeness; same key asks once; delayed reply for A after the switch to B changes nothing; A slow / B fast (A's reply causes no commit); B slow / A fast with a return to A; reply after unmount; reply after disable; 404 / 403 are keyed. Mutating the hook to ignore the key makes 6 of them fail.
- Screens, with a React `Profiler` that records the committed DOM after every commit: Live (workspace prop, deployment prop), Canary (workspace prop, URL workspace), Paper workbench (URL workspace), Alpha 360 (deployment link; leaving Performance: no commit on another tab carries the panel).

## Sibling hooks with the same reset-in-effect pattern

Fixed with one shared helper (`series/keyedAnswer.ts`, `useKeyedAnswer`, same derive-in-render rule), each with its complete key (port identity plus request):
- `cockpit/EvidenceFrame.tsx` `useEvidenceRead` (the governance parent/evidence read of the selected request),
- `cockpit/evidenceExtra.tsx` `useApprovalEvidence`,
- `cockpit/Rail.tsx` `useCaptureCapabilities`,
- `alpha/useAlphaReads.ts` `useAlphaLifecycle`.
Tests: `series/keyedAnswer.test.tsx` (generic hook, `useApprovalEvidence`, `useEvidenceRead`, `useAlphaLifecycle`; `useCaptureCapabilities` is not exported and is covered through the cockpit suite).

Audited and already correct (state is stored with its key and derived): `live/useLiveReads` (`useLiveRead`, `usePanelPaging`: `held.base === v2 ? pages : {}`), `canary/useCanaryRead`, `workbench/useWorkbenchReads` (`held.key === key && held.api === api`), `workbench/useExitParent`, `alpha/useAlphaReads` `useRead` / `usePagedRead` (their reset effects only drop held data that render already hides).
