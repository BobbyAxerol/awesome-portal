# P22 — current reader runtime receipt, 2026-10-03

**Verdict: P22 §31 GET_READER_RUNTIME_ACCEPTED**, not whole P23/P24 or release GO.
Source: clean shared `2cf6b904ae79f096f23a312ee548cc34fa958247`, containing
`d5d09875` plus Claude's latest five commits. Read inputs: Unified P22/P23/P24,
Guide P21/P22, A13 rules, queue §31/addendum and §36/§37, P22 stale-seal packet,
FE-W1–W5 receipt/requests, actual composer/publication/auth implementations.

## Exact runtime transition

- Only Control API was built (all actual Docker build layers were cached).
  Worker/Python/frontend/PG/NATS/roadmap containers and images were preserved.
- Normal helper fallback through `sudo docker` filtered the non-secret source
  stamp. Its initial `up` was a no-op and still served `build_commit=unknown`;
  that result is **not** a pinned acceptance receipt.
- Passing only the two explicit source stamps through the fixed-project helper
  recreated Control API; gateway config passed `nginx -t` and its existing
  process reloaded upstream DNS (not a frontend rebuild/restart).
- Current Control image:
  `sha256:1f88418131cb34547829c9c452e8894b50b70be8d3cc9fa05cc1a3ed013660ad`.
  Prior exact image retained:
  `sha256:215558ab090ed3adfbb431b45378e9edcd0068b449cffe279cc243d6742da20b`.
- `/api/control/healthz`: source `2cf6b904`, `build_dirty:false`;
  `/api/control/readyz`: ready. Three actual compiled reader/schema SHA-256s
  match the fresh local build; source stamp alone is not the byte proof.

The checked-in `preview.sh` fix forwards **only** `PORTAL_BUILD_COMMIT` and
`PORTAL_BUILD_DIRTY` through sudo. It does not preserve a generic environment,
add secrets, change flags, disable port/project guards or widen authorization.

## Named real GETs — 14:17:14.916–14:17:16.626 UTC

Each row has both composer GET and publication GET, each HTTP 200 and parsed
by the actual current Zod schema, not a fixture/double.

| Run | Candidate | Both-reader result / guidance | Selected-params rail |
| --- | --- | --- | --- |
| R-WFO-022 | `rc_06GFW43NE42YF64NMXYDS6GD32` | Existing local seal; `P22_CURRENT_SOURCE_CHANGED` / `CREATE_NEW_RUN_AND_SEAL` | 351 / RUN_GLOBAL / null reason |
| R-WFO-023 | `rc_06GFFDG3SA17Y5WPBN58NFM5B2` | Existing local seal; `P22_CURRENT_SOURCE_CHANGED` / `CREATE_NEW_RUN_AND_SEAL` | 351 / RUN_GLOBAL / null reason |
| R-WFO-027 | `rc_06GG2K1TN6QQNJJN3RJ5AS5XC1` | DELIVERED; `P22_ALREADY_DELIVERED` / NONE; receipt retained | 2 / STUDY_LOCAL / null reason |

The rail ordinal equals the existing served selected trial number. No
cumulative-progress numbering or parsed rail text was used. The source and
pack fingerprints were not amended. R-WFO-027 retains approval
`apr_06GG2K4A9Q3AHFVK0WV5GXNCY2`, publisher `claude-preview`, full approval read
`DENIED`, `approval:null`: independent R1 read permission, not a failed publish.
The lawful new-run/new-attempt/new-candidate guidance and exact English copy
remain in [the source amendment](./STALE_SEAL_GUIDANCE_AND_APPROVAL_READ_2026-10-03.md).

## Custody, tests and failed probe

- Job count **65 → 65**; no compute created by a GET. One pre-existing queued
  job was not cancelled or claimed as this receipt's job.
- Before/after SHA-256/counts agree for the three runs' run/candidate/draft/
  frozen-pack/publication/delivery/retention-pin rows (seven table groups).
  No old seal, publication, declaration, data, grant or approval mutation.
- All six unrelated preview container IDs, image IDs, start times and restart
  counts are byte-for-byte unchanged.
- A fresh normal preview auto-session was created for the GETs and logged out
  through normal auth. Its exact DB session state is REVOKED; no other session
  was revoked. Session tokens/cookies were never printed or retained in Git.
- First probe failed because the **new receipt helper** read `run.run_id`
  instead of the contract's `run.id`. Fixed the helper, not the API/contract;
  normal logout ran even on failure. Failed receipt retained SHA-256
  `f8f6bf1e199a90ccb2442db4103a9ed93f9db4cb248a6bfb3f69bc9d7a8613ea`.
- Final private immutable receipt SHA-256:
  `0843df07847ef77c3573a57ebdd2577555ed1ff530d13c12bdb194f9bc3c6e78`.
  Exact private home:
  `/home/bobby/.local/state/portal-research-p22-20261003-PiMsor/`.
- Focused receipt checks **4/4**, shell-helper fallback/direct/forbidden-port
  tests **3/3**, shell syntax/diff whitespace and Control API build PASS.
  The focused unit cases are FIXTURE_ONLY, separate from six actual GETs.
  Mandatory normal hook gates this grouped source/docs landing; no unrelated
  engine/load/DR/browser suite was manually rerun. Its first attempt stopped
  at an existing foreign `contracts-test-node` name collision, not a Research
  assertion. The old unconditional cleanup was also unsafe after a collision;
  daemon history did not establish that foreign invocation's final verdict.
  Do not claim its tests passed. The harness now uses the invocation's unique
  mktemp-derived name and checks its exact ownership label before cleanup.
  Three additional stubbed-harness ownership/isolation tests pass (10 focused
  cases total). Retry the normal hook after this necessary correction, not
  with `--no-verify` or by deleting a foreign live container.

## Handoff / remaining goal / C4

Claude: the new compose/publication types and blocked action/native trial
triple are now served on :8095. Consume them without parsing reason/rail
strings or changing the frozen pack. R-WFO-022/023 remain historical, not
resealable under another actor. R-WFO-027 remains published with scoped R1
read denial and the own immutable receipt. No frontend mapping/design edited.

The mixed preview images are intentionally **not** called a new whole-product
candidate. Linked non-reusable audit child, P23 authentic 502/restored-browser/
candidate parity, three lost original manifest bytes, genuine second-engine
qualification and P24 downstream acceptance remain open in the full goal.

C4: receipt session revoked; no test stack/network/volume created or removed.
Old rollback image and immutable private receipts retained. Root **185 GiB
free / 29%**, available RAM ~10 GiB, swap 0; **NO_ACTION_NEEDED** for cache
pruning. No production, remote push, dev/main merge or signed release dispatch.
