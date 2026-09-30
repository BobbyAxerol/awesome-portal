# F3 WFO real-browser parity subset — 2026-09-30

This is a **12/12 scoped PASS**, not the canonical 54/54 F3 lane, F5, full
P23 or P24 acceptance. The isolated P23 cell on loopback `:8096` ran from
clean commit `bae2a78c13c88fb092b391d5ac75fffa925a0209` with seven image
IDs pinned in its private `identity.json`. No dev/production runtime, business
data, source system, commands or frontend design were changed.

`node scripts/research-p23/f3-wfo-browser-parity.mjs
--label=f3-wfo-browser-parity-20260930-c` passed Screens S03–S08 at 1280 and
660 px against completed real WFO run
`rrun_4e6c52d2171e86e734a7519bc3bfe2f5`. The browser called each named,
same-origin BFF GET without route interception. The assertions compare real
API facts to rendered symbol, fold verdicts/plan, exact equity decimals,
trial count/selection, frozen parameters/integrity and retained replay route
and candles. All 12 cases had zero page errors, off-origin requests,
unexpected auth/server refusal, horizontal overflow or implicit mutation;
workspace job count stayed **173 → 173**. Screenshots and the receipt are
private `0600` files, not checked into Git.

Private receipt: `f3-wfo-browser-parity-20260930-c.json`, SHA-256
`34a552f93320fa81f1feb4a7b19fa4cb7c02c6925395f951e70e42d879602480`.
The receipt records all seven image IDs and each route, viewport and response.
The harness requires a clean live checkout whose HEAD matches the pinned
runtime identity, so it cannot silently accept a stale cell. The script-only
commit `bae2a78c` passed the full pre-commit hook: 174 Control API test files,
1,344 tests passed and one intentional skip, with contract/workspace gates
green. No product UI or backend API code changed in this checkpoint.

Preserved earlier attempts are `f3-wfo-browser-parity-20260930-a.json`
(9/12, SHA-256 `925940d0b2c593ce1be39706f29a911c4c879cd77a5a9ce9df7808868477211c`)
and `f3-wfo-browser-parity-20260930-b.json` (11/12, SHA-256
`623b6d67f6fa5fb9f01722df5eceb3d7234fa04b1c6b14a9a8b2baba58a496d7`).
Those failed because the test asserted a loading DOM state before the named
GET had completed; subsequent loaded-state inspection and the final exact
parity run confirmed a harness race, not an accepted product defect.

This adds real WFO panel parity to the earlier F3 route/release bridge subsets.
It does **not** cover all 54 cases, source refusal rendering, the full HiFi
visual gate, S02/S14 write journeys or other P23 workload/DR gates. They stay
open in the Unified Plan; no phase is marked complete by this receipt.
