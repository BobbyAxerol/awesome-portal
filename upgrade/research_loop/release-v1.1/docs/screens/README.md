# Per-screen build specs

One file per screen. Each spec has 4 sections: **Purpose & layout anatomy** (what the hi-fi shows, block by block) · **TS implementation** (component tree, types, endpoints, dynamic-data rules) · **UX rules** (interaction grammar, empty/degraded states, density) · **Acceptance**.

Global TS rules (apply to every screen):
- Feature folder `features/quantbt/` in the portal frontend; RTK Query api slice `quantbtApi` per BAR-12 read-model routes; NO metric is computed client-side — the UI renders `{value, definition, unit, segment, source, as_of}` envelopes verbatim (v0.6 §6).
- Every identifier chip (run_id, av_, prm_, rc_, claim_) is one shared `<IdChip kind=… />` component: mono font, navigable, copy-on-click, tooltip = provenance.
- Degraded rendering is a TYPE, not an if: `Artifact<T> = {state:'COMPLETE',data:T} | {state:'DEGRADED',data:Partial<T>,missing:string[]} | {state:'MISSING',reason:string} | {state:'NOT_APPLICABLE',reason:string}` — every panel takes `Artifact<T>` and renders the state label; no empty charts.
- Hash cursor: one `useEvidenceCursor()` hook (read/write `#stage=&fold=&trial=&params=&schedule=&route=`) shared by 03/04/05/06/07/08; navigation preserves it.
- All wide tables live in `overflow-x:auto` containers with internal min-width; page wrappers are fluid (`width:100%; max-width:…; min-width:0`).
- Charts: ECharts 5.5 / lightweight-charts 5 with portal chart theme fonts; axis maxima rounded (never raw float labels); per-axis scaling when outliers differ by axis.
- Fonts/sizes: Newsreader 22px/300 titles, Inter 13px body, JetBrains Mono data; card radius 8; section label 10px uppercase +.07em.
