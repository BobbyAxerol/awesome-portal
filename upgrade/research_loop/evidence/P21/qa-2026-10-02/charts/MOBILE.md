# Research Loop phone width (390 / 360), 2026-10-02

Base `09acc900`. Change: one `@media (max-width: 720px)` block appended to `apps/portal/frontend/src/research/researchScreen.css` (+54 lines, no other src file). Contract test: `src/research/researchScreenMobile.test.ts`.

## Measured (stubbed preview, document.scrollWidth; before -> after)
| Screen | 390 | 360 |
|---|---|---|
| S00 journey | 404 -> 390 | 404 -> 360 |
| S01 run library | 460 -> 390 | 460 -> 360 |
| S02 new run (data) | 390 -> 390 | 360 -> 360 |
| S03 progress | 427 -> 390 | 427 -> 360 |
| S03 search | 390 -> 390 | 373 -> 360 |
| S04 evidence WFO | 437 -> 390 | 437 -> 360 |
| S04 evidence P04 | 395 -> 390 | 395 -> 360 |
| S05 freeze | 390 -> 390 | 360 -> 360 |
| S06 split | 390 -> 390 | 361 -> 360 |
| S07/S08 execute | 390 -> 390 | 374 -> 360 |
| S09 report | 390 -> 390 | 360 -> 360 |
| S10 lineage | 490 -> 390 | 490 -> 360 |
| S11 RC | 390 -> 390 | 360 -> 360 |
| S12 atlas | 390 -> 390 | 360 -> 360 |
| S13 compare | 390 -> 390 | 360 -> 360 |
| S14 import | 390 -> 390 | 360 -> 360 |

Fixes: wrap long codes (`overflow-wrap: anywhere` on `.research-screen`), journey phase rows stack and cards go full width, stat rows and flex-none/nowrap chips may shrink/wrap, fold notes and lineage gate chips shrink, the A1 parameter table scrolls inside its own box.

## Laptop (1440x900) identity
16 laptop PNGs (14 spec cells + S12 + S03 progress) from a throwaway copy of the spec, before vs after: 13 byte-identical, 3 differ by 6 / 35 / 56 px (<=0.004%). Same-code before vs before: 14 identical, 2 differ by 8 / 12 px. Anti-alias noise only; the CSS is inert above 720px.

Limit: fixtures do not carry the very long `PORTAL_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE...` codes on S09; they are covered by the blanket `overflow-wrap: anywhere`, not by a fixture measurement.
