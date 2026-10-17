# ELP2-10 — Native read obligation custody (NC-01)

## Entry, authority and exact ownership

2026-10-17 continuation of Bobby's approved backend batch, not a new phase or
runtime activation. Entry `5cac1151e27a3276ed9c32f56fe485197c2cdcaa`, branch
`docs/research-loop-plan`, checkout `/home/bobby/portal-research`.
At entry code is **APPLIED_UNCOMMITTED / NOT_RUN**. This packet is not a receipt
of tests which have not finished. Current peer Unified notes are preserved.

Owned source: `current-human-candidate.sql/.ts`, `current-human-mutations.ts`,
`native-business-read-codec.ts`, `native-business-read-client.ts`; owned tests:
`elp210-native-core-obligations.spec.ts` and the existing native client spec.
Primary owns this packet, linked 04/07/10 handoffs and Unified addendum.
Forbidden: frontend/design/baselines, actual Core/PM installation, credentials,
current users/grants/sessions, stable data, dev/main/push/sign/release/deploy.

Independent NC-01 source review/proposal was accepted with custody-only limits.
Proposal SHA256 `b19e56f63ea4c9f4ba4dd029b4ce2510fe673e763c05851eff0322004812a2ed`;
review README `85a3871e1a89909b5324709b3e214147fdbc973226827d3f6eeaa737a9b3a05c`.
Subagent supplied a private patch, not a tested or landed implementation.
Primary reviewed and integrated it plus authenticated-result correlation
(primary patch SHA256 `fe47396bb842d2e866f3dfb97817394292c7cb8fe198881c9091cd0a1e463de9`).
Count the integrated code/tests once; normal hook and integration remain primary.

## Requirement → implementation → validation matrix

| Obligation | Implementation | Required affected validation |
|---|---|---|
| Core custody before PM ISSUE | Durable token-free exact Base, immutable lease/attempt IDs, domain and selected source identity; COMMIT ACK before return | Real disposable PostgreSQL, restart and physical COMMIT followed by injected lost ACK |
| No separate native authority barrier | Union obligation view under existing singleton physical lease epoch; shared caps/drain/writer checks | Legacy/native ordering, real REPEATABLE READ writer, retained/unresolved caps |
| Current actor and deadline | Actual user/session/generation fingerprint, selected issuer/workload/workspace/environment/domain, original UTC microseconds, bounded expiry | Nine substituted axes, stale session, expired/session/install/TTL deadline |
| Missing native recovery cannot release or starve reverse recovery | Explicit optional port; filter before LIMIT; one invocation budget; returned JSON ignored | Missing port, fake SETTLED, abandoned mutation, shared recovery budget |
| Authenticated transport result is not shaped JSON | Client-owned WeakMap witness from actual TLS/framing/codec success | Real local TLS successes; reject clone/shaped/codec-only/other-client/accessor/Proxy |

## Implemented semantics, not commissioning

`native_read_custody` is an explicit private candidate selection; absence is
unavailable, not an enable flag. `admitNativeRead` snapshots actor and token-free
Base before its first await, validates current authority in the existing Core
transaction and commits custody before any external ISSUE can be attempted.
The transaction ends before source/network/signing work. Lost COMMIT ACK does
not expose an admission: recovery reads the **same** IDs, never a replacement.

Native `ADMITTED` and `UNKNOWN` remain unresolved, including before ISSUE and
after TTL. The fresh-only candidate SQL protects immutable records, current
session/revision/deadline, cross-family ID collisions and writer serialization.
Lazy schema preflight refuses an old installer instead of silently counting
legacy obligations alone. Constructors remain zero-DB. This is candidate SQL,
not a numbered migration or an operational installation.

Limits ≤128 unresolved / ≤4096 retained / TTL ≤60s are existing correctness
bounds, **not approved production budgets**. An absent recovery port or arbitrary
`{state: SETTLED}` cannot remove custody. There is deliberately **no native
terminal/release API in this slice**. Do not mount this partial candidate: an
admitted native read must continue blocking authority mutation until genuine
terminal recovery is implemented and qualified.

`nativeBusinessReadAuthenticatedResult(selectedClient, result)` recognizes only
the exact result owned by that actual client. It returns action, detached
token-free Base, binding/core digests and prefixed SHA256 of actual reply bytes.
`NATIVE_BUSINESS_READ_RESULT_UNVERIFIED` is a private refusal; no public DTO or
OpenAPI changes. The witness is transport correlation, **not a held read handle,
business grant, final-egress receipt, source settlement or permission to release**.
SQL metadata likewise cannot authenticate the configured TLS source.

## Tests and resource plan

At entry all new results are NOT_RUN. New native custody suite has 18 test
declarations / 27 expanded cases against a disposable PostgreSQL candidate.
Native client adds one new rejection case; six existing TLS action cases gain
correlation assertions (not six additional cases). Reuse unchanged wire codec,
installer, workspace/root/lifecycle authority suites in the same focused batch.
Synthetic identities, local test certificates and source doubles are TEST_ONLY;
they are not real PM/Cloudflare/business qualification.

Use the existing bounded gate, shared resource lock and source/index freeze:
maximum 4 CPU / 4 GiB / 8 GiB transient, exact owned Node/PG/network, no host
ports or heavy parallel jobs. Capture eight protected runtime tuples; remove
only owned resources and release own lease after terminal. Keep failed receipts.
Focus first; one coherent normal-hook commit after affected proof, not repeated
full suites for Markdown. Actual results/hashes/cleanup are appended only after
the corresponding controller is terminal.

## Remaining ordered work / handoff / rollback

1. Integrate the independent finite-egress owner's genuine final-send/confirmed
   abort component semantically; do not duplicate or overwrite its private work.
2. Implement the separate native signer, exact ISSUE → ENTER custody, authenticated
   source result persistence and same-attempt restart/terminal recovery. Status,
   expiry and observation are never release authority.
3. Final HTTP completion or confirmed abort must produce a genuine terminal
   witness; authenticated positive source cancel/resolve settlement must commit
   before Core can release. Lost acknowledgements remain UNKNOWN.
4. Qualify the minimal dependency-closed actual Core/source installation and
   trust separately. No blind migration chain or test-clone substitution.
5. Approved numeric budgets/calibration, coexistence, applicable original P184
   G2 and assigned browser acceptance remain full-10 dependencies; 11 is not ready.

Claude intake follows campaign §7.3: read relevant review/receipt/request at
entry and before landing, record disposition in the owning packet and link
Unified, never fabricate an acknowledgement. This slice adds no public consumer
field; UI remains `NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW`.
Backend can continue the ordered native lifecycle integration, not call full
authority complete. Rollback is code/config exclusion before installation; never
delete an admitted obligation, immutable audit, original evidence or real data.

Exit: local candidate custody requires the actual focused and hook receipts;
full ELP2-10 / native source authority remain **OPEN** even if those pass.

## Focused terminal — 2026-10-17T20:18:10Z

Controller `native-obligation-focus-200932` exit0, **332/332 PASS** across nine
files,77.94s test duration; Control API build and scoped PostgreSQL restore/four
access-row digests PASS. New custody27 and client45 are subsets of332, not new
coverage added on top. Source/index unchanged; all eight protected runtime
tuples identical; owned Node/PG/network resources absent and own lease released.
Gate log SHA256 `03f2a0a8dc3b4f788d2aaa08e825aa39a0d21af7ae0a808c67e4c8808a4ca5e0`;
controller source `82ce689aaa7167788b2edd36e3a73e8c4934d21ddafc6585f6d4e83adc25452b`.
One observed Node1.119GiB/3GiB and PG68.78MiB/1GiB sample is not a peak or a
production capacity measurement. No real PM/business authority was exercised.

Independent witness review: **ACCEPT_SOURCE_ONLY_WITH_LIMITS**, no concrete
forgery/getter/Proxy/clone/other-client blocker found. The reviewer also found
an adjacent proposal defect: candidate SQL accepted only `Z` while the source
codec accepts original `Z|+00:00`. **ACCEPTED_FOR_IMPLEMENTATION** in this same
owning packet: widen only the suffix, never normalize immutable wire/deadline;
add one actual-PG microsecond offset round-trip asserting equal instant but
different Base hash. The normal hook must prove this additional case. Expected
custody count becomes28 (19 declarations), not a claim of an observed result.
No duplicate focused build for this one correction; previous332 remains valid
only for its frozen source and the unchanged affected behavior.

Landing preparation `native-obligation-land-201820` stopped on stdin EOF before
source freeze/staging/hook/test; exit1, owned resources absent, no commit/runtime
change. Retry `native-obligation-land-201833` uses PTY with the same bounded
controller, not hook bypass. Actual normal-hook result is still PENDING.

First hook attempt201833 stopped immediately at its whitespace guard: the new
previously untracked test had a blank EOF line. No build/contracts/API/restore
ran and no commit was created. Remove only that line, preserve the rejection,
then run the same normal hook with unchanged authority/tests. Staging is the
same15-path owned allowlist; no foreign index path is altered.

## Normal-hook terminal — 2026-10-17T20:47:09Z

Landed `c730729eaf5071bdcf151a40aebedc4a0f483019`,15files +926/−18;
the shared Unified diff preserves six peer-owned lines and is not counted as
independent Codex implementation. Controller `native-obligation-land-201928`
exit0/PASS:67contract files/791tests, API build,376API files/6040tests PASS,
two existing skipped files/three existing skipped tests. API duration1219.80s.
Custody28 includes the new actual-PG `+00:00` microsecond case; client45 is a
subset, not additional to6040. Scoped PostgreSQL restore/four access-row digests,
source/index freeze and all eight protected runtime tuples PASS; exact owned
Node/PG/network resources absent and own measurement lease released.

Log SHA256 `026d9c8684f866a7a722ede975497dc8a7ce82d5320a17a134a10572b7603019`;
terminal controller SHA256
`ce3fc00c48241aab96ca0fecf741abe8ab908e62e5f77803b2e766397f422030`.
This closes the NC-01 local custody implementation gate only. Real source,
terminal reconciliation and all full10/11 gates remain open. The next bounded
code batch is [NC-02 primitives](native-read-lifecycle-primitives.md), not a
claim that custody alone can be safely mounted.

## Same-family lifecycle continuation —21:47UTC

NC-02 landed43e877fd through its [actual normal hook](native-read-lifecycle-primitives.md#normal-hook-terminal-20261017-214415):
791contracts/6192API PASS+3existing skips, build/scoped restore/four access digests,
source/runtime preservation and owned teardown PASS. Native custody remains the
SAME ledger/barrier/recovery surface. [NC-03](native-read-lifecycle-integration.md)
adds explicit private MANAGER_HTTP lifecycle without converting old CUSTODY_ONLY
rows or using reverse leases. Source ACK must commit before pending clears;
status/restart/expiry/DB no-send fences are not final HTTP abort evidence.
Entry APPLIED_UNCOMMITTED/NOT_RUN/unmounted; actual trust/provider/writer install,
budgets/calibration/coexistence/P184G2 and assigned Claude/browser remain open.
