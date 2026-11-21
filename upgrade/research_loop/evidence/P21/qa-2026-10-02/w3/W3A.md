# W3A — mobile shell (top bar, Display menu, sidebar chips)

Base `ba605889`. Goals (1) and (6). Uncommitted; diff in `apps/portal/frontend/src/{app,lib,styles}`.

## Done
- <=720px top bar: 156/132px -> 56px, one row: menu button, env badge, one crumb (ellipsis), search icon, Display button (all 44x44). Brand, workspace chip, Theme, Density, Planned modules, Users & Access and the rail-collapse toggle are hidden there.
- Display menu (`DisplayMenu` in `TopBar.tsx`): disclosure button, panel mounted only while open (no duplicate controls in the a11y tree). Holds Workspace chip, Theme, Density, Planned modules, Users & Access (owner only). Enter/Space open (native button), Esc closes and returns focus to the button, Tab walks Theme, Density, Planned modules, arrows work on the selects, focus leaving or an outside pointer closes it.
- Sidebar: SOON/PROTOTYPE chips are not drawn at any width. Row keeps its opacity; link gets `aria-label="<label>, soon|prototype"` (`maturityStateName` in `lib/portalState.ts`). BLOCKED/LEGACY chips and the Execution PREVIEW chip are unchanged.
- >=721px: top bar markup is the same (extra classes only). Laptop top bar pixels identical.

## Measured (vite preview, 28 Research Loop cells, mobile 390x844 and 360x740)
- bar height: 132-156px -> 56px on all 14 screens at both widths; sticky bar = 6.6% of 844, 7.6% of 740.
- scrollWidth == viewport at 390 and 360 on all 14 screens (before and after).
- Theme/Density/Planned/workspace visible in bar at <=720: none.
- Keyboard (real Chromium): first Tab = "Skip to content"; Enter opens, Tab -> Theme -> Density -> Planned modules, ArrowDown changes Theme, Esc closes and focus = Display button, Space reopens, tabbing out closes.
- Laptop 1440x900, before vs after PNG (PIL): bar rows (y<93) identical in 14/14. Sidebar rail differs in 14/14 (chip removal: bbox x 141-231). Content area right of the rail (x>=260): 11/14 byte-identical; 3 differ by 6 / 56 / 15 px in chart canvases (S02, S03, S07; antialiasing noise, same order as the earlier host run-to-run noise, 0.004%).

## Expected baseline changes (owner records)
- `research-loop.visual.spec.ts` (28): all 14 laptop images change in the rail only (chips gone); all 14 mobile images change (56px bar, no collapse toggle).
- `visual.spec.ts` (100) and any shot that includes the non-Execution rail or the <=720 bar: laptop rail rows lose SOON/PROTOTYPE chips; mobile bar becomes the one-row bar; mobile drawer shots lose chips. Execution Carbon already hid chips: expected unchanged. Execution mobile shots change in the bar.
- No baseline was touched.

## Tests
- New `src/app/displayMenu.test.tsx` (Display menu behaviour, one current crumb, skip link first, `maturityStateName`, shell.css mobile contract: inside 720px query, 56px nowrap, 44px targets, tokens only).
- `topBarRunCrumbCollapse.test.tsx`: two exact-class assertions now include `portal-crumb--current`.
- `npx tsc -b --noEmit` clean (roadmap excluded); vitest app+styles+disabledReason+lib+components+research: 187 files, 3458 passed.

## NEEDS-SHARED / notes
- 721-1023px: the rail-collapse toggle still shows (pre-existing: `.portal-icon-btn` beats tailwind `hidden`); not touched, laptop rule.
- Execution Carbon on mobile: price chip hidden, alerts chip shrinks with ellipsis; carbon hides search in the bar as before.
- The 360px crumb gets ~56px when the env badge is shown; long labels ellipsise, full run id is in `title`.
