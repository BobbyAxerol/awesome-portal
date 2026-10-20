# Core009 preparation — what "composed + Research policy installed" needs

Author: Claude (backend writer, Bobby's 2026-10-20 assignment; Codex reviews, Edge/PM own
the HK source side). Read of: `CLAUDE_CORE009_PRIORITY_HANDOFF_2026-10-20.md` (full),
`CLAUDE_ALL_BACKEND_HANDOFF_2026-10-20.md` §3.B/§4, `CORE_008_INSTALLED_READY_009_RETURN_2026-10-19.md`
§4, the Edge request (incl. its 19–20 Oct appends, read-only from the Codex checkout),
`AGENT_WORKING_RULES.md` §10.10/§10.13, and the code named below at the base commit
`5152cee3` (ancestor `7818d563`, whose installed bytes it contains unchanged).

**Status: PREPARED_SOURCE_ONLY.** Not installed, not connected, not run. No runtime,
database, Docker, SSH, secret, session, grant or policy was touched. Companion files:
[runbook](CORE009_OPERATOR_RUNBOOK_2026-10-20.md),
[owner return for Edge](CORE009_PREPARED_OWNER_RETURN_2026-10-20.md),
templates + readback SQL in `deploy/research-preview/native-core-templates/`.

## 1. Verdict in four lines

1. **The standard composition is selectable by configuration alone — no composition
   code change is needed.** `main.ts` already runs `nativeCoreRuntimeReference` →
   `prepareNativeCoreRuntime` → `composeOwnedNativeCoreRuntime` → `createControlApiApp`
   → `AppModule` → `nativeCoreManagerReadConsumer` on ONE `Pool` when the env pair is set,
   and is byte-for-byte the ordinary boot when it is absent (proved by test, §7).
2. **What blocks it is the running process, not the code.** The installed container's
   entrypoint is `research-reverse-bootstrap.cjs`, a different program that never calls
   `prepareNativeCoreRuntime`/`composeNativeCore` and silently ignores the env pair.
   Composition therefore means *replacing that process* with `node dist/main.js`, which is a
   restart (Pool/JS state not preserved) and a Codex-lane operation.
3. **Installing the policy is a separate offline step** (`execution-native-install policy`),
   never part of boot. It composes from the *full* manifest (Core refs + well-formed source pins) but
   never contacts the source, and an expired private installation stays constructible
   (`createNativeRead` comment), so it can run with a historical source window. That breaks the
   "Core waits for Edge / Edge waits for Core" cycle at the cost of a second manifest (and a second
   restart) with the live pins; the validator supports it as `--policy-install-only`.
4. **Two real gaps found**, both outside what was asked to fix but material: no Core
   mechanism revokes a manager-domain grant (§6.3), and STREAM cannot be added after a
   READ-only install (§5). Both are decisions for Bobby/Codex.

## 2. Requirement → existing component

| # | What must hold | Component (file) | State |
| --- | --- | --- | --- |
| R1 | One process, standard entrypoint, native selection by env | `main.ts`; env pair `CONTROL_API_NATIVE_CORE_CONFIG_FILE`/`_SHA256`; profile `native_manager_review_v1` (`compose.native-review.yaml`, last overlay, `preview.sh` marker `execution-native.enabled`) | EXISTS |
| R2 | Strict, hash-pinned, canonical manifest; private refs hydrated (Ed25519 keys, TLS) | `prepareNativeCoreRuntime`, `native-core-runtime.ts` | EXISTS |
| R3 | ONE bounded Pool for the whole app | `buildPool(DATABASE_URL, native.poolProfile)` in `main.ts` | EXISTS |
| R4 | Registered Research schema verified on that Pool before compose | `assertRegisteredResearchCurrentHumanSchema` (schema + registered ledger installed in 008 per the installed return; not re-observed here) | EXISTS / INSTALLED |
| R5 | Actual DB/system id/login/session role equal the owner-intake target | check at the end of `native.compose(pool)` | EXISTS |
| R6 | ONE trust chain, ONE mutation coordinator, ONE recovery registry | `composeNativeCore`: `CurrentHumanCandidate.createNativeRead` per selection → `recoveryRegistry`/`admissionRegistry`; `CurrentHumanMutations(pool, enumerator, reverse(refuses), limits, native)`; `privateOwnerCommissioning` trust wrappers | EXISTS |
| R7 | AppModule mounts the consumer only for the genuine composition, SAME pool/trust/coordinator | `AppModule.register` + `nativeCoreManagerReadConsumer(binding.pool===pool, trust, mutations)`; refuses lookalikes (DI tests in `native-core-bootstrap.spec.ts`) | EXISTS |
| R8 | Bootstrap-owned Pool lifecycle (Core pool ended only after full app drain) | `NativeCoreApplicationOwner` | EXISTS |
| R9 | Private owner artifact → fresh policy + domain grants, no SQL seed, typed conflict | `privateOwnerCommissioning` → `ExecutionAccessService.installReviewedManagerDomainPolicy` via `CurrentHumanMutations.executeVerified` | EXISTS (tests added) |
| R10 | Offline operator entry for R9 | `cli/execution-native-install.ts policy` (also `schema`, already used in 008) | EXISTS |
| R11 | Fresh source window: native acceptance, observer pins, trust | Edge/PM (`selected_source.pins`, TLS refs, workload, origin) | **MISSING (Edge/PM)** |
| R12 | Owner approval of the exact artifact + independent review | Bobby / Codex | **MISSING** |
| R13 | Genuine session for the protected owner for acceptance | none in the standard path (§9, Q4) | **OPEN DECISION** |
| R14 | Reviewed templates + offline shape/finite-validity check + readback + runbook | added by this package | DELIVERED (source) |

## 3. Gap: the reverse bootstrap vs the standard composition

Source: `scripts/execution-v2/research-reverse-bootstrap.cjs` (sha256 `cc6ae429…`, identical to the
installed bytes) and `main.ts`.

| | Reverse bootstrap (installed) | Standard `main` |
| --- | --- | --- |
| Entry | descriptor `portal.research-reverse-bootstrap.v1` + pin, private IPC socket, state file | env pair + `loadConfig()` |
| Pool | `buildPool(DATABASE_URL, descriptor.pool_profile)` | `buildPool(DATABASE_URL, manifest.pool_profile)` |
| Candidate | reverse `CurrentHumanCandidate.create` (issues identity leases to PM) | `createNativeRead` per selection (READ lifecycle) |
| Coordinator | `new CurrentHumanMutations(pool, candidate, recoveryClient, limits)` — **no native port** | built inside `composeNativeCore` with `reverse` port that refuses (`CURRENT_HUMAN_REVERSE_PURPOSE_REQUIRED`) + native port |
| App | `AppModule.register(config, pool, undefined, {currentHumanMutations})` | adds `executionAccessTrust`, `nativeManagerRead`, `nativeManagerRealtimeLimits` |
| Native consumer / policy trust | none | mounted, owner-artifact trust chained |
| Extras | callback TLS listener on WG, session issuance IPC, `finish`/`shutdown` custody commands | none; SIGTERM → `owner.close()` |

"Identity mutations preserved": the *coordinator class and tables are the same*
(`elp210_candidate.mutations`, the singleton `authority`), and the standard path injects the same
`currentHumanMutations` into `AppModule`, so AuthService login/logout, access, governance and
workspace mutations keep being intent-logged and drained exactly as before. What does **not**
carry over is the reverse-only machinery (issue-identity IPC, PM callback listener, reverse
recovery client). That is acceptable only because identity is `COMMITTED`+Core-ACK, the role is
dormant and the session is `FINISHED` (Edge returns, handoff §2) — which must be re-proved by
readback immediately before the swap (runbook G5). If any reverse custody were non-zero, the
standard coordinator **cannot** recover it (its reverse port refuses by design), so the swap must
not happen; keeping the old bootstrap running is then the only recovery path. A combined
"reverse + native in one process" composition was judged unnecessary and not built (it would be new
authority code in a frozen custody area).

Hazards found in the current arrangement: (a) setting the env pair on the old container is a silent
no-op (the forbidden "env without a mounted consumer"); (b) the bootstrap ignores SIGTERM on purpose,
so `docker stop/restart` ends in SIGKILL and `BOOTSTRAP_STARTUP_REFUSED_REVIEW_CUSTODY` (the
2026-10-19 preview incident) — use the IPC `shutdown`; (c) the native-review profile *requires*
`realtime_limits` in the manifest even for a READ-only plan.

## 4. Exact `CONTROL_API_NATIVE_CORE_CONFIG_FILE` / `_SHA256` contract

* **Env:** both absent → ordinary boot, nothing read. Exactly one present, empty, relative,
  non-normalised, >4096 bytes, control characters, or a SHA that is not 64 lowercase hex →
  `CURRENT_HUMAN_NATIVE_RUNTIME_CONFIG_INVALID` → process exits 1 with `CONTROL_API_STARTUP_FAILED`.
  There is **no fallback** to the legacy boot (tests).
* **Manifest file:** regular file, not a symlink, owned by the process euid, mode `0400`/`0600`, size
  1…131072; `lstat` → `open(O_NOFOLLOW)` → `fstat` must match dev/ino/size → read → SHA256 equals the env
  pin → bytes must equal `JSON.stringify(JSON.parse(bytes))` (one compact spelling; duplicate keys and
  pretty-printing refused) → strict zod (`schema_version: portal.native-core-runtime.v1`, unknown keys
  refused, inline secrets impossible: keys/TLS are `{path, sha256}` references).
* **References:** each loaded with the same gates (TLS ≤32768 B, keys ≤16384 B), SHA-pinned; signing keys
  must be Ed25519 PKCS8. The owner artifact is *not* loaded at runtime.
* **Content bounds:** pool (`max≤10`, timeouts ≤60 s, `query_timeout > statement_timeout`);
  `realtime_limits` (required for Research); 1…64 selections, ≤63 retained-recovery, 1…2 owner intakes;
  `mutation_limits.maximum_intents ≤ 4096` (**must exceed the intents already used** — 32 audit rows at
  008, the installed bootstrap cap is 128); finite windows are checked per read, not at load.
* **Research ceiling (`native_manager_review_v1`):** exactly one selection, `paper`,
  `PAPER_BINANCE_USDM`, `portal_user_id == subject`, one owner intake with exactly one principal pin,
  matching `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`.
* **Compose-time:** `expected_workload_id` equals every source workload; source identities unique;
  limits common; each active selection is a principal of its workspace's intake; live DB identity equals the
  intake target. Any failure disposes the same pool once and starts no app.
* The offline validator in this package applies the same schemas and rules *plus* finite-validity and
  cross-file bindings, without reading any referenced file.

## 5. READ vs STREAM; what `DOMAIN_READ_ONLY` / `stream_commissioned:false` mean

* Two independent actions in one grant model: `business.read_all` (READ) and `stream.subscribe` (STREAM).
  `selectManagerDomainGrant` resolves each separately; STREAM requires a current READ **and** a
  `stream.subscribe` ALLOW for the same subject/environment/domain/field seal and never exceeds the READ
  ceiling (`evaluateManagerDomainStream`). Existing real-PG tests cover STREAM-alone-no-READ and revoke.
* **The installer ACK labels were static constants** in the installed image: `DOMAIN_READ_ONLY` and
  `stream_commissioned:false` described the installer's *scope*, not the artifact. They did **not** record
  that a STREAM grant had been inserted when the reviewed artifact listed one, and they never meant
  "STREAM approved/connected". This package makes the ACK derived: unchanged output for a READ-only artifact;
  `DOMAIN_READ_AND_STREAM_GRANT` / `stream_commissioned:true` only when an ALLOW `stream.subscribe` entry is
  in the artifact. Still not source publication, SSE frame, notice or egress evidence. The currently installed
  image keeps the old constants — confirm STREAM from the grant readback (runbook block C).
* **Sequencing consequence (decision for Bobby):** the installer is *fresh-policy-only*
  (`old policy !== null` or any stored grant → `POLICY_REVISION_CONFLICT`), and there is no Core path that adds a
  manager-domain grant to an existing policy. So "READ now, STREAM later" is **not possible** without new
  authority code. Plan A: READ-only artifact now, STREAM becomes a later new capability (needs a reviewed
  seam, access* lane). Plan B: one artifact with both grants installed together; STREAM then is *recorded* but
  stays inert until a source publishes and the realtime consumer is exercised; independence is proved
  by negative tests (STREAM without READ, wrong domain, revoked) and by the readback, not by a second install.
  The validator enforces whichever plan is declared (`--plan`).

## 6. Restart, custody, rollback

### 6.1 What a restart does
* The JS `Pool` and every in-process object (candidate registries, reverse IPC session cookie, callback
  counters, SSE coordinators, rate limits) are **not preserved**; the new process builds a fresh Pool and
  rebuilds registries from the manifest + durable tables. Durable truth lives in `elp210_candidate.*`
  (`authority`, `leases`, `obligations`, `native_read_obligations`, `mutations`) and survives.
* Therefore the swap is allowed only at **zero custody** (runbook G5) or with the original recovery retained:
  non-zero *reverse* custody → keep the old bootstrap (the only recovery owner); non-zero *native* custody
  (none exists: no native READ ever ran) → the original source selection must be present in
  `retained_recovery`. Replacement via SIGKILL is never acceptable; use the IPC `shutdown` handshake.
* Open `authority.drain_id` would block mutations in the new process (`CURRENT_HUMAN_DRAIN_CONFLICT`); the
  readback must show it null.

### 6.2 Rollback
Before the policy install nothing durable changed. **The policy install is not reversible by Core**: policy,
grant and event rows are immutable history with no delete/overwrite path (fresh-only installer). Containment is
the finite grant window plus the independent artifact review. A standard server can be stopped gracefully
(`owner.close()`); the old identity-only bootstrap can be restored from the preserved image/compose/descriptor
only after zero custody and as a separately reviewed lifecycle step. Backup restore is last resort.

### 6.3 Revoke gap (needs a decision)
`ExecutionAccessService` has no operation that revokes or narrows a *manager-domain* grant (public revoke handles
legacy scoped grants only; `AccessRepository.saveManagerDomainGrant(...,false)` exists but nothing calls it).
Edge's plan "revoke both source acceptance and Core grant" is therefore only half available: the source side
(maintenance append, revision N revoked) works; the Core side can only expire. Options: accept expiry as the
Core revoke for the first window (keep grant windows short, validator `--max-grant-hours`), or have the access*
owner add a coordinator-backed private revoke seam with a correlated receipt (outside this package: I stayed out
of `access*`).

## 7. Code change and evidence (all fakes; see §8 for what needs PG)

| Change | Why | Default-path impact |
| --- | --- | --- |
| `native-core-runtime.ts`: export `nativeCoreRuntimeManifest`; extract the Research ceiling into a pure `nativeCoreResearchReviewTarget` used by the closure | validator and startup share one rule | none (same function body; existing 44 tests pass) |
| `core-owner-commissioning.ts`: export the document schema; ACK reports STREAM truthfully | §5 | READ-only ACK byte-identical |
| `execution-v2/core009-preparation.ts`, `cli/core009-validate.ts` | offline shape + finite validity + cross-file bindings + lstat-only reference check | additive; not imported by any runtime path |
| templates, readback SQL | §8 of the runbook | files only |

No change to `main.ts`, `app.module.ts`, `composeNativeCore`, the installer, the reverse bootstrap (its hash
`cc6ae429…` and focused-test hash stay the rollback/provenance pins), or any access*/self-eligibility*/
manager-series* file. Default-path proof: `elp210-core009-main-boot.spec.ts` asserts that with the env pair absent
`buildPool` gets `(DATABASE_URL, undefined)` and `createControlApiApp` gets `(config, pool, undefined, undefined, undefined)`
with shutdown hooks and no native module call; with it present the same Pool object reaches `compose`, the app
and the owner, and the app receives the exact `compose` result. `elp210-core009-composition-identity.spec.ts` then uses the REAL prepare/compose and the actual
AppModule consumer factory (fake Pool, temp leaves) to show by reference that the dependencies handed to the app are the
composition's own trust/coordinator objects, that `selectedCandidate` returns one stable registry entry bound to the Pool,
that a wrong person/profile/workspace/domain never reaches a Candidate, that the consumer factory refuses a different Pool
or a coordinator from another composition, and that a second composition (the offline installer, or a restarted
process) shares none of them.

## 8. Needs PostgreSQL / not run here

NOT_RUN (needs disposable PG or a runtime): real-PG installer semantics beyond the scripted fake
(`elp210-manager-domain-access.spec.ts`, `elp210-commissioning.spec.ts`), `execution-native-install policy`
end to end, schema registration against the actual Core DB, the readback SQL executed, TLS/source calls,
session issuance, connected READ/STREAM/revoke/recovery. Normal R2/R3 for the final bytes is also NOT_RUN
(focused vitest + typecheck only, per rules §10.10a).

> **Update 2026-10-20 (BE-P10).** Bobby answered Q1–Q4 and Q5/Q6 in part: **Plan B** (READ and STREAM together, each <= 2 h and <= the renewed
> trust end), an **official Core-side revoke** (built: `execution-native-revoke`), the **acceptance session by the actual AuthService** (built:
> `execution-native-session`), image = **rebuild** (the installed `7b2c7f34` image has none of it). Gaps 6.3 and Q4 below are therefore CLOSED IN SOURCE
> (tests with fakes; real PG/runtime NOT_RUN). Steps: [runbook revision 2](CORE009_OPERATOR_RUNBOOK_2026-10-20.md); ledger:
> [BE-P10](../BE-CLAUDE-2026-10-20/BE-P10.md). Q7 (exact artifact fields, reviewer) and the swap itself remain open.

## 9. Questions for Bobby before any runtime step

1. Plan A (READ-only now) or Plan B (READ+STREAM recorded together)? (§5)
2. Grant and installation windows: how long, given trust ends `2026-10-20T08:00:59Z`? Renewed trust needed for any later window.
3. Core-side revoke: accept expiry for the first window, or authorise a private revoke seam (access* lane)? (§6.3)
4. Acceptance session for the protected owner: the standard app has no owner-session issuer. Options: (a) temporarily set the
   quick-look auto-login to the owner on this Research-only container for the window (public-reachable? needs your call),
   (b) a reviewed one-shot session CLI (new code, uses the same coordinator), (c) normal login if a credential exists.
5. Image: reuse installed `sha256:7b2c7f34…` (config-only delta, ACK keeps old labels) or rebuild with this package (R3, labels fixed, validator in image)?
6. Who runs the swap (Codex lane) and the root/service uid arrangement for the owner artifact (two reference sets) or relax the installer's root-only rule?
7. Approve the exact artifact fields (policy revision, three domain seals, grant ids/windows) and name the independent reviewer.
