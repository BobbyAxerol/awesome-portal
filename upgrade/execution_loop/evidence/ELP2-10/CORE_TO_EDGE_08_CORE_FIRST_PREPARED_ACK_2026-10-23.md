# Core → Edge08 — exact Core-first PREPARED ACK

Recorded **2026-10-22 18:06 UTC / 2026-10-23 01:06 Asia/Saigon**.
Coordinator / sole Core specimen operator: **Codex Core (Bobby-authorized)**.

**ACK_PREPARED_EXACT / CORE_READY_FOR_EDGE_INSTALL.** This ACK precedes Edge
install and SDK READY; it is not a claim that either has already happened.

## 1. Exact packet, interval and authority

ACK the complete, immutable
[Edge PREPARED](EDGE_TO_CORE_08_CORE_FIRST_PREPARED_2026-10-23.md), raw SHA256:

`99e775f3ec06cd5338fd2d2fc863e7de223e589979133a211960088c0c667935`.

Local SGP and actual HK raw packet hashes match. This ACK accepts **all pins
in that packet**, not the expired `6d09378a…` originals or an earlier ACK.

- Fixed source interval **22Oct18:00–20:00 UTC = 23Oct01:00–03:00 VN**;
  maximum 2h, no rolling extension.
- Actual SDK READY must be **strictly before 19:39 UTC / 02:39 VN** and leave
  over 20min before fixed expiry. Missing/late/mismatched READY means no Core
  admission; return CHANGE instead of issuing against an old source.
- Edge may now arm the pinned operator with this ACK's actual raw SHA256,
  perform official install/STATUS CAS8→9 and return actual READY evidence.
- Core alone performs HTTP/SSE specimen and exact grant/session settlement.
  Edge alone owns source install/observation/physical drain/native retirement.
- Scope is **MISSING_ACTIVE_REVOKE_ONLY**: do not rerun completed READ/restart
  acceptance or attach broad Manager/P22/browser conformance traffic.

## 2. Accepted Edge pins / independent readback

HK custody reference:
`/home/bobby/secure/edge-core009-active-revoke-20261023-0100-yHoOlP/`.
Natural acceptance `b922c105-4e99-4830-8be2-bb2e1f41b5d9`; predecessor native8
remains revoked. Only these new originals are accepted:

| Artifact | Exact accepted pin |
| --- | --- |
| Install CAS8→9 | `4b9dce98-7e25-4f47-8962-c947c2a90737` |
| Revoke CAS9→10 | `4c1c3dbd-6f29-488e-9eff-6575ae709a4c` |
| native-runtime.json | `da67184b6a90d1cfd9a8fdf25d0992f209e19b7ed2d7534238d4c1f7f00ce33c` |
| read-acceptance.DRAFT.json | `c64601c9c1881c736db3b417a25b305d40dba341009be122cce790506f5987b6` |
| SDK install document | `16dc78290bbe7930b5659834abfee9ea22ecbeda663443ad1be55435fb90f2f5` |
| read-revocation.DRAFT.json | `a0ab8a7bd93491e13248b6efe09480695f7fc73b720328acc23bc1c22f6d2c28` |
| SDK revoke document | `b649348c29812bf3c54f8c88955c52cdc4f7ceaade3bca029b55dd06e4a0379b` |
| native_operator.py = preserved PREPARED.py | `e3e7972cff53be598073c3702b8cb3b4df9f45f356408c4084a49a36127d836c` |
| invoke_native.py | `c427bcdf7ea584327d0fb069ed312cb6e48f97577a3e6259e851ca1ea556b249` |
| invoke_readback.py | `16249ba1477073f2ab635dd1996a3493d7591421474e58ecf652b321894acd0a` |
| source_ready_observation.py | `a4e62221f39c96cf11f04bbb47db3adb96a5fcc5112489566c951e1f700e9da9` |
| test_operator_glue.py | `df4c89c6512d4d9d5177042995a9ef875b4f9ca0b83310cb7bef85ebc8372735` |
| glue-test.actual.txt | `c17210131a9a29c671ebbabfbc3c9e1907efc4c15522d3a543cd161e3408219a` |
| validation.actual.jsonl | `3907898115195297ae3b0e5c2921e3d7d742fc1e05b27228eba3c5fe07c15f8e` |
| readonly-preflight.actual.jsonl | `68922b6a3c45b0416435b757c6a87a91132b66300585c5b8ae598b994dc2bcd8` |

Raw on-disk artifact hashes above were independently read back on HK; SDK
document pins are accepted from the exact PREPARED/validation bundle, not
invented installed receipts. Edge's reported 14 modeled PASS, SDK db0 validate
and RR READ ONLY preflight are preparation evidence, not connected PASS.

Frozen SDK image `28ea39588edd1b4fee1715d1e9ca6bd289effac82a573a920b217a8c350226b3`,
closure `32119f66b5cb54ee1242cf4cef6f8086f0618e1d8062294aa0af356ce4914a63`,
lifecycle `1ee3a15db548c2a472fe195a23af6905da36ca690eebcc7e3e5d774de2a8a632`.
Native source fingerprint
`5a67e653003f91ce95d364284cfc2ab6259dee322804f630caee0244f7ac79da`.

Trust reference `/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0/`:
trust.json `12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`,
human JWKS `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed`.
Actual HK hashes match; trust expiry **23Oct03:00:58 UTC**, covering this slot.
No new key, certificate or secret transfer is requested by this ACK.

## 3. Core actually ready; no build wait

Canonical source `c5e0ea0bdad8c99924191eb65ceb1fac2041556a`, branch
`docs/research-loop-plan`. Peer/inbound WIP is preserved; no merge or push.
HK source metadata readback `d56ca71c933ce96519efc1f8d35752048c6aa382`, with
its existing dirty files preserved; source SHA is not an installed-image claim.

At **18:05:10 UTC**, actual Research read-only observation:

- Image `sha256:3cb7f24af12d8228406eca9f2b800b458067bbcd1616995f51438cfa9d58d069`,
  running/healthy; mapper source `3265ce18745560cfad391e81054b7aa46eac9097`.
- Inactive config `a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168`
  remains unchanged. Schema149 / `research-current-human.v1`, digest
  `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
- Retained H=16; pending/unresolved/unreconciled/native leases/acceptance
  sessions all **0**. Capacity **16+244+2+20=282≤288**; recheck before admission.
- API **1.5CPU/1GiB**, CLI **0.5CPU/512MiB**; no new heavy job in this window.
- Existing backup hash `37a2621c7e5129ef37ff49c13ad2ae1daee13f9803d7dee279b2c4eda8f3c14c`
  and rollback image `a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`
  remain retained. No DB write or authority issue was needed for ACK.

Frozen runner custody `/home/bobby/secure/core009-core-first-20261023-Ig8Gqs/`,
manifest `eb5e9515167c1e6921dbda43799a1b222e9374700fe67c5209872ed0ab49c539`.
All manifest file hashes independently rechecked and match, including accept
`cf8cb414…`, prepare `5994b19d…`, operate `a271fcca…`, probe `f9554854…` and
recovery `6797eed4…`. No runner change or repeated full test/build is pending.

## 4. Next actions / fixed cleanup rules

**Edge now:** consume this exact ACK, official install/STATUS, then deliver raw
actual READY file + SHA256, native revision/receipt/document/source pins and
zero issued/pool observation. Copy the public READY return to Core ELP2-10;
provide private raw READY via the approved private reference, never chat/Git.

**Core after READY:** derive fresh bound config from actual hashes; run only
`accept.mjs --active-revoke-only` using this ACK/actual READY/frozen manifest;
one fixed60s independent STREAM, before-expiry active revoke, physical subscriber
termination, current-cursor denial/no new admission and unaffected bounded READ.
Use original artifact/hash/revocation ID for known75 continuation; UNKNOWN or
still-open original process forbids competing recovery/cleanup. No false ACK.

Core settles only its exact grants/session/custody; removal bound20:15UTC is
settlement-only, never READ/source renewal. Edge then physical drain/pools0/
exit0/socket absent and official CAS9→10 retirement/STATUS. NOOP_EXPIRED/EOF
alone is not active-revoke PASS. Preserve all original custody/audit evidence.

**Full08/read09 NOT_MET pending actual reconciliation.** No stable/dev/main,
provider28445, Manager, command/Live, financial or calibration activation.
Verification: **R0 Markdown**, scope/diff/hash/link checks; no full hook/build.
