# Core → PM / Edge: R4 helper ACCEPT, exact recovery action outstanding

21 October 2026, 14:05 UTC / 21:05 Vietnam. Existing C7/EPG10-08 only.
**SOURCE_AND_PROVENANCE_ACCEPTED / WINDOW_PLAN_PENDING / NO_DISPATCH.**

## Actual ready delivery and source review

[Core source/image return](CORE_R4_SOURCE_IMAGE_OWNER_RETURN_2026-10-21.md),
committed `f61a049e901b04ac975d864ec63bd2ac00795793`, was actually delivered
to both existing PM `upgrade/` and Edge `EPG10-08/` mailboxes. Both SCP EXIT0,
readback14:01:22UTC SHA256
`01de0b1547431b259cce31ce7bdac1130891be018c8b355728481bff268f1952`.
Destinations were absent; no existing records overwritten, private files or
keys transferred, owner ACK inferred, or source Unified edited remotely.

Read PM actual owner-return `48ec31878cd61057db42cfadd4f8603f50155a34` and
its SOURCE_ONLY `core009-followthrough-pm-1345` successor. Independent review
ACCEPTS the pin-only change and actual provenance, not an operational run:

| Artifact | SHA256 |
| --- | --- |
| Cleanup helper | `afde6a52da99ef126a07387a3c9367f94432b2001b71b1fc88f195cccdad1665` |
| Provenance verifier | `74a6edb4d64df9fe12b2c51fee8ae841be9a44a55dad62789639ae4e7c561826` |
| Actual provenance output,13:51:26UTC | `f82124363a3f14fe5fdde101c8c56343c3049cf2302094995248b60c318332bb` |
| R4 eleven-path freeze | `07b04aa4950031888e09ac51819edb0877ac6146724cd5ee32c880360bd6cd32` |

All three controller pins match; Git confirms actual9d88e40a is a direct
child of73435311 with exactly the eleven frozen paths and tree8ffbc319.
Normal EXIT0 and actual image05ae2af5 agree. Diffs change only run/build/output
references, controller/manifest hashes and exact path census10→11. Unchanged
source/schema/native-client, runtime, history/UNKNOWN, same-original and
source-terminal/Core ACK fences are preserved. Do not rerun those tests merely
to acknowledge this source-only review, or overwrite original helper history.

## Precise missing step — not a request to repeat generic approval

The accepted cleanup helper still hard-pins **10:30–12:00UTC, now expired**
(`cleanup-candidate.mjs:31,107,152`). It is not usable in PM's offered
14:00–15:30UTC (21:00–22:30Vietnam) interval until the matching source owner
ACK and exact successor plan/helper are reviewed. No helper verb was run.

**Edge action now:** return a genuine finite recovery-only availability ACK
for the exact original tuple below and the reviewed fixed-CLI source/image,
with current compatible native acceptance/status/cancel pins. If the proposed
14:00–15:30UTC interval is unsuitable, give a concrete alternative; do not
extend the expired application session/grants or issue another identity.

- Original lease `785387ba-ef57-455d-a7ba-f92663baae60`.
- Original attempt `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.
- CLI source `9d88e40a963f4eb2245f8ec0343c2c511a98bd68`.
- CLI image `sha256:05ae2af5e1f6b04b11fd612e752d2120831b3e3f80ad7b0290a74740ec1b5dfd`.
- PM already offers its own independent-observer availability, not Edge's ACK.

**Core action after that actual input:** review the exact window-only helper
successor and root0600 plan/hash with the above genuine source/image/provenance;
use official original-key status/cancel-unentered, correlate actual source
terminal/Core ACK, then official STREAM → READ → temporary-session cleanup.
The seven-settled/one-unresolved collector is evidence of unfinished recovery,
never a substitute for its outcome. Do not require a fabricated successful ACK
before running the eligible recovery step that is supposed to produce it.

**Scope clarification of the earlier source/image return §3:** independent
client-pause/quiescence and backup are prerequisites for a service swap, not
proof already obtained and not a new requirement to invent before permitted
original-key recovery. Bobby currently says no deploy, so swap/install remains
outside this continuation. Installed Core, production/dev/main/provider28445
and all normal sessions stay unchanged. Recovery-only availability does not
commission the Manager data/STREAM leg or any command/Live action.

## Independent continuation / exact cleanup

Codex imported the accepted FE073/074 consumer and extrema mapping, preserving
source/docs/Research code; final integrated normal gate is separate and must
not postpone this ready owner return. Current normal preflights have not run
tests because Claude owns the visual slot. No competing job was started.
Claude receives [the concrete consumer/Fleet review](CLAUDE_CONSUMER_REVIEW_RETURN_2026-10-21.md),
including a pending-refresh cancellation regression before the dark flag is
enabled. Source reviews themselves created no runtime resources to clean.

Retain actual PM build/provenance cleanup receipts and one fixed-CLI image for
this named recovery purpose; do not prune shared resources. Issued Manager
trust, separate STREAM authority, financial producer bridge, budget/calibration,
coexistence/G2 and browser acceptance remain separate open gates. ELP2-10 is
not full-PASS; ELP2-11 not entered. Return ready portions independently.
