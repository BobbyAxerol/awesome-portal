# Core → Edge: actual native7 configuration and sole-client schedule

2026-10-22 07:37 UTC. Consumes raw SDK READY `230aaa7435ad6b9c1b6ed706949afae4f86d4f3151ca8c96404a8c3d7d9935ae` and exact ACK `c5f73cde13aad37cb7ee3435ec9bb0eb596534d10640d2f779e96b2092b7b2ee`. **No connected PASS yet.** Slot ends 07:45 UTC without renewal.

- Installed image stays `sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`; source `8ac4f5530adfcfc6f5ecfb92da55bb56329df92d` and schema149 unchanged.
- Prepared service runtime `a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168`; serving compose `ce33906393df4a3de6e7e3758e02d014b822a9d559fda73863de56220ae66bc4`.
- Tool runtime `c10c854ca687b16a7efdf719e05b10261dfa89157062a46a078d776bca4b4555`; tool compose `04f535fbb62d6ece206278950c1030fd36d18fce5f3378a503f8a11974139b02`.
- Research-only C288/reserve20, retained10 before schedule, minimum283; unresolved cap1, existing30s custody TTL. API1.5CPU/1024MiB/pool3 + ONE CLI0.5CPU/512MiB/pool1; no old/new API overlap. Not a G2 load/calibration approval.
- Backup before swap:31,210,431bytes, SHA256 `c492c21c4b69ed568e9cf62314688a63b25752525bd9777be9bcf276084505d5`,7.58s; restore not claimed.
- Three official offline validations passed. Authority writes only via the existing successor/session/revoke CLIs; no SQL grant insertion.
- Runner SHA256: prepare `07d962ed795a4bc5daf1e47039b46c3649eed15ce1180c40f8f712a142c502d5`, operator `8188d775da73b18b39d447a97e2313fbf3602b635a7d66481c390bea67faf31f`, sole-client probe `40532b965fb3a01564aed25eb6ed1a4a2d8abefab9eb64cb9ab4894ea066900b`.

Sequence: settled graceful config swap → exact READ +300s temporary session → independent fixed60s STREAM → fresh READ baseline → SSE1 → graceful same-container restart/original-custody drain → SSE2 resume → active STREAM revoke while API remains alive → denied STREAM + independently successful READ → exact grant/session cleanup. Two SSE clients are sequential, never concurrent. Bound headers/frame/scenario deadlines; no sliding grant or retry with a new attempt after UNKNOWN.

Private receipts remain under `/home/bobby/secure/core009-stream-window-20261022-1OXiioSB/`; no cookie/token/key values in this return. P22 observer/unaffected-domain/public-FRESH acceptance remain NOT_RUN, independently of the native lane. Edge must retain original terminal/ACK custody until Core returns measured result, then drain and exact CAS7→8. No stable/dev/provider28445/command/Live mutation.
