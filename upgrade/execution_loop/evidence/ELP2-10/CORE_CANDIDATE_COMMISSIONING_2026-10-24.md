# Core candidate commissioning — 24 October 2026

## Entry / approved scope

Bobby approved continuing ELP2-05/06/07/09/10/11 after the
[Accounts and financial source return](CORE_ACCOUNTS_AND_FINANCIAL_RUNTIME_RETURN_2026-10-24.md).
Do not repeat those implementation packages or their unaffected focused gates.
This round joins actual source, trust and current principal before commissioning
the Research candidate. No UI, remote push, stable/dev/main/provider28445,
command or Live activation. Edge remains the only TS/PM coordinator.

| Input | Round-start pin / state |
| --- | --- |
| Core | `/home/bobby/portal-research`, `docs/research-loop-plan@0d253193fda0f60286ba0d7e6a6f0b0347e1c3b1`, clean |
| Claude | `/home/bobby/portal-research-fe2`, `claude/post-land-20261022@00e7f6cff2fadbd88b8ed461fa870b28ee88ad94`, clean; no new committed request after previous intake |
| Owned Edge candidate | `/home/bobby/.worktrees/portal-core-current-policy-wire-20261024@06d835c6cb9aa0ae6225bb50c0c221f2f192d26f`, clean |
| Active Edge | `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2@8727e5303b1815d54bc2bdcb927a55457ff4da5b`, three peer tracked Markdown changes and incoming untracked files preserved |
| PM, read via Edge coordination | `/home/bobby/.worktrees/trading-system-pm-v1_1@6f474c72088f000a198a73324ad3083236f2bf5c`, peer WIP preserved |

### Work ownership / validation / rollback

- Primary owns runtime composition, actual installation decisions, shared files,
  Unified/sync, evidence and integration. Existing three helpers are reused for
  read-only source/config/financial reviews; no duplicate writer or heavy gate.
- Inspect explicit source selection, independently approved publication metadata,
  mounted trust and genuine ordinary principal before enabling each lane.
  CURRENT does not imply STREAM/HISTORY/REPLAY or broker BINDING publication.
- Correctness cells remain bounded by the previously approved 2 CPU / 1536 MiB /
  300 s envelope. No performance/coexistence run until actual numeric bounds,
  target and workload are accepted. Source-only code does not imply runtime READY.
- Test only changed configuration/composition/default-off/authority paths. Reuse
  prior valid source/test receipts with explicit impact; final integrated gate
  belongs to the frozen install candidate, not each documentation update.
- Rollback restores only the named candidate image/config/mounts; never delete
  original identities, grants, obligations, source transactions, audit or data.
  Back up any installed data before forward migration; no migration is assumed
  necessary merely because the image changes.

## Results / current status

**SOURCE_COMMITTED_R1 / TRUST_STAGED / NOT_READY_CONNECTED.** Two Core commits
are on the shared Research branch; the two earlier packages were not redone.
No image/config/schema/listener installation is claimed.

| Delivery | Exact source / change |
| --- | --- |
| Reverse socket admission | `075119b55a8ecccd3cfee2b4fe14b4679adeefd5`,2files,+47/−3. Real absolute pre-header mTLS deadline replaces reliance on Node's coarse timeout sweep; transfers remaining deadline into the actual request and preserves ownership of pending DB work. |
| Financial private bootstrap / shared recovery | `68992b03754099cbe79b9c41d7cd5dd5b7927031`,12files,+1103/−13. Strict hash-pinned Research/Paper configuration, actual registered schema before listeners, exact shared pool/coordinator/Candidate, explicit independent outbound recovery, no automatic principal/context/grant. |
| Edge actual DB TLS | Owned HK candidate `8b010874af2237cddb3ad32c6c8083b2e0a52a56`,2files,+150/−3. Opt-in private DNS/verify-full/CA path for actual Manager database; default/legacy path unchanged. Source only, not installed. |

Core code total this round:14files,+1150/−16, not including documentation or
the previous Accounts/financial packages. No public OpenAPI/DTO/enum changed;
regeneration and frontend component changes are not required for this slice.

### Correctness fixed and independent review

- Financial recovery now enumerates its **own original Candidate** in the
  existing global mutation coordinator. Wrong pool, duplicate workload/candidate,
  malformed enumeration and conflicting original binding refuse before dispatch.
- All sources share the existing recovery-call ceiling. A fair key cursor
  advances after failures so an earlier unavailable/UNKNOWN native attempt
  cannot permanently starve financial recovery. Scheduling is not authority;
  restart still reads original durable custody and signed source terminals.
- Source ACK alone never clears custody; global UNKNOWN/pending checks remain.
  The new actual-PG regressions assert signed terminal and durable state before
  session revoke applies, preserving the same mutation/lease/attempt/digests.
- Startup verifies the actual pool/schema before creating listeners. A private
  actor pin is **not consumed as a login**. Issuer stays UNBOUND until a genuine
  authenticated consumer calls `withPrincipal`; startup does not issue one.
- Independent review ACCEPT after the starvation/pre-header findings were
  fixed. Tests use explicit doubles where stated; no synthetic financial
  proof or test terminal is presented as PM/Edge connected acceptance.

### Tests actually run / impact-based reuse

Verification tier **R1** per campaign§10.10c; no push/ff-landing or final
installed candidate freeze occurred. Do not run the45–50minute full hook just
to record this intermediate source delivery. R2 remains required for the
frozen integration candidate; no all-suite/connected PASS is claimed.
[Machine-readable test dispositions](CORE_CANDIDATE_COMMISSIONING_2026-10-24.test-results.json)
retain failed attempts/retakes separately and do not combine them as new coverage.

| Lane | Actual result / scope |
| --- | --- |
| New bootstrap/runtime/recovery + native defaults/lifecycle/profile | **82 unique cases PASS** across6specs:16bootstrap,17recovery,12runtime,9application lifecycle,21native bootstrap,7pool. Initial sandbox run80/82; only the2filesystem failures were retaken unchanged on the real filesystem and passed. Do not count retakes as extra coverage. |
| Reverse transport | **19/19 PASS**, actual ephemeral loopback TLS1.3/mTLS,2.61s including new idle/partial-header cases; DB/source candidate remains TEST_ONLY. Initial sandbox `listen EPERM` was retaken unchanged with loopback permission. |
| Isolated PostgreSQL | **40/40 PASS**,40.11s:9new multi-source financial tests +31native custody regressions. Actual fresh PG/SQL/ISSUE/ENTER and ephemeral signed terminal proofs; no real PM financial-purpose proof or installed source. |
| Old-source test control | At base `0d253193f`: existing absent-registration/default test PASS; new financial-participant test fails specifically because no financial enumeration occurs. Confirms the new regression is effective, not a test that was already green. |
| Production TypeScript | `npm run build` **PASS exit0**. Whole-test-corpus `npm run typecheck` was stopped143 after >3minutes/~2.2GiB; not called PASS. Production source compilation and the affected focused tests are the R1 gate. |
| Edge runtime TLS | **39/39 PASS**, production lib/bins Clippy and binary build PASS;2CPU/1536MiB/300s,noOOM. Existing217-test library receipt remains historical coverage, not39 additional distinct tests. |
| Unchanged packages | Reuse previous Accounts65, financial assertion49 and financial composition90 at their documented pins only for unchanged logic. New registration/bootstrap/mTLS deadline are covered above; no repeat of unaffected full gates, source probe or browser matrix. |

Filesystem diagnosis: sandbox exposed `/` and `/tmp` as UID65534 while the
process euid was1000. The private-directory guard correctly refused that
ancestor. No validator or test assertion was weakened to pass the retake.

| Local evidence | SHA256 |
| --- | --- |
| `/tmp/elp210-financial-bootstrap-focused-20261024.json` (initial80/82) | `f32de2e17adc019c5d7a2789aed6e6258ee41896313d02461ecd0971b63db84c` |
| `/tmp/elp210-financial-bootstrap-observer-retake-20261024.json` (only2affected cases) | `0d5602b3f1a2d7d56459453a92ef01a033eb8016a24c089bd99fa7cb333a3a60` |
| `/tmp/elp210-financial-bootstrap-pg-20261024.log` | `d7821d4028f8ae3710410672bb065cab206c49e7bef1bc3f28378433381c4fbd` |
| `/tmp/elp210-edge-source-20261024.gt6Znz8L/round4-manager-tls.log` | `901892a4276b8e551b2430d3bf53c16de5698421f6f33d6157b6f09237017f23` |
| Edge binary, **not image** | `3e0c4e53a06aa99b0b336de31c43201a7b839e1f0cd4bddbdc60ee628c003b03` |

### Actual input check and private trust preparation

Read-only Research queries found **zero** ordinary policy/grant rows for
`research-workspace`. Official `business.read_all` policy requires actual TS
acceptance, coordinated through Edge. Native Manager-domain/owner ADMIN does
not supply it. Existing722-row v5 byte probe is still only source verification;
raw ACCOUNT rows cannot be recast as Fleet or authorized population facts.

22Oct native TLS expired23Oct03:00:58UTC. The separate existing Manager
client certificate remains valid to29Oct13:27:14UTC; its CSR/key was not
recreated. Core has now prepared a new **native candidate-only** bundle:

- Candidate `elp210-5e8e2ec5-a898-45e2-ba5d-0e8820868282`;
  validity through **2026-10-25T12:59:52Z**, no acceptance slot armed.
- Core private reference:
  `/home/bobby/.core009-research-trust-20261024-sdplO8am/elp210-trust-9SkeGW/core/`.
- Exactly8PM-side files transferred to HK
  `/home/bobby/secure/edge-core-current-trust-20261024-5e8e2ec5/`;
  destination0700, all8leaves0600, chain verification PASS for both peers.
  **No Core private key transferred.** No stable rights/trust copied.
- Public trust manifest SHA256
  `95d892e9394dc71a808f722b35390b4277caebd8eb6296a1f13ca44c91f156e0`.
  CA DER SHA256 `78f1f074c6dd84bac94bc9698e9de4f77254ce7e7933ca620b5bfc8d38275aea`;
  Core leaf `e8c6852da83a118ed53d38a5073b229e70ffe3c3521a1093df9a69bce8b60c68`;
  PM leaf `16fc1339efb9fa8dfa67ccabe4b3e887e1b24f9fda9cbc77ab0f14ccd1345233`.
- Provisioning script shredded its transient CA private key; verified absent.
  Initial sandbox OpenSSL attempt failed and its script retirement path ran;
  unchanged provisioning succeeded outside that sandbox. No secret in Git/chat.

### Next actions / phase dispositions / Claude handoff

[Concrete Edge input/action return](CORE_TO_EDGE_COMMISSIONING_INPUTS_2026-10-24.md)
was transferred to HK EPG10-08 and SHA256 read back. CI-01…07 identify exact
owners and non-Core inputs, not a generic “wait for window”. Return each part
independently; do not make bounded CURRENT wait for financial/command/G2.

| Phase | Current exact remaining exit |
| --- | --- |
| ELP2-05 | PM actual financial-purpose proof/callback constructor, accepted issuer/key semantics and authenticated APPLIED/ACK after original receiver COMMIT. Existing identity/terminal signatures do not substitute. |
| ELP2-06 | Edge accepted3-grain selection/independent metadata + actual ordinary human permissions and loaded Manager CA/audience/kid/profile; then Core installs matching Research candidate and verifies APIs. |
| ELP2-07 | Commissioned Core→Edge gateway submit/status/recovery and accepted operation targets; no command/Live activation. |
| ELP2-09 | Bind fresh native trust to qualified source, CURRENT/STREAM separately authorized; measure cache/cursor/SSE/revoke/restart/recovery. HISTORY/REPLAY remain independent. |
| ELP2-10 | Frozen compatible image/config/schema receipt, approved numeric workload/budget/calibration, matched coexistence/G2 and actual browser consumer acceptance. |
| ELP2-11 | Integrate verified source/runtime/permissions and remaining DR/rollback/review exits; reuse valid original backup receipts where inputs unchanged. Not full-PASS from source commits. |

**Claude:** no new public DTO, component, layout or baseline change. Keep the
rich fixture/consumer work and existing Accounts readers. Source private actor
pin is not a browser session or API fact. Real UXM-08/09/10 acceptance follows
each qualified row/operation on the matching installed image. No browser/API
positive lane is asserted by these unit/PG tests. New consumer review remains
AWAITING_CONSUMER_REVIEW; no acknowledgement invented.

### Cleanup / rollback / installed identity

Owned PG/node containers and their internal network were removed after exit0,
OOMfalse, combined2CPU/1536MiB; Rust cell was also removed. Test logs and old-
source control snapshot retained for review, not runtime data. Native trust is
explicitly retained for Edge preparation and must be retired after acceptance
or expiry; old custody/key references are not removed by that cleanup.
No volume/image pruning, data deletion or peer WIP change. Capacity verdict:
**NO_ACTION_NEEDED for transient cells; retained named trust has Core owner.**
Read-only capacity after cleanup:621GiB filesystem,411GiB used,210GiB free
(67%); no owned test container/network left. Research API still healthy.

Installed Core remains
`sha256:01692fc5702f21856f5c932efc0786d3f65ff47bb3ed7d1949ee18666f31458a`;
new config/listeners OFF. No new image digest, migration or installed schema
receipt exists this round. Do not build/install a misleading “qualified”
image from mismatched/missing authority inputs. Rollback stays candidate-only;
no push, UI, stable/dev/main/provider28445, command/Live or release action.
