# Chart life wave — GROUP=SEARCH

Finding: none of the SEARCH-group charts use ECharts; they are DOM/SVG diagrams. Instead of porting them, a shared
`src/research/chartLife.ts` adds entry draw-in once on first mount (WAAPI, 600ms cubicOut, off under reduced-motion
and `smokeMotionAllowed()===false`) and a hover/focus/tap readout of the mark's real served text.

Chart inventory and what is now interactive
- SearchStageB PoolPlane: points fade in; focusable; hover/focus/tap readout line (candidate, IS, OOS as served).
- SearchStageB FoldDecayBars: bars grow from the zero line; bars focusable with tooltip (decay, IS, OOS).
- SearchSurface scatter (A2): points fade in; hover/focus readout under the plot (existing point title).
- SearchSurface progression (A3): trial dots fade, best-so-far ticks and theta line grow in.
- SearchSurface distributions (A4): bins grow from baseline; bins focusable; shared readout (range, count, mean IS).
- SearchSurface importance (A5) / theta journey (B4): bars grow / markers fade in.
- SearchDetail ParameterTable (A1): theta* range ticks fade in, focusable; RetainedPoolFreeze bars grow.
- SplitDetail WindowAnatomy windows + FoldRows train/test segments grow from left.
- WhatIfCard 9x9 heat cells fade in.
- NewRun WindowTimeline segments grow in. LineageDetail StoryBar segments grow in.
Not changed: SearchFoldStrip glyphs (aria-hidden, text alternative exists, shared with EngineAtlas).

Tests: src/research/chartLife.test.tsx (keyframes, once-on-mount, reduced-motion => none, readout).
tsc clean (excluding pre-existing roadmap-task-board errors from missing react types in that package);
vitest 720 research tests (search/split/lineage/newRun/whatIf) + styles + disabledReason pass.

NEEDS-SHARED: none. NEEDS-BACKEND: none (no values computed).
Limit: shared crosshair / zoom does not apply (no shared time axis in this group; DOM diagrams, no zoom).
