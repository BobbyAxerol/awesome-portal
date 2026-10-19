# Original08 — exact Research identity prerequisite

This is a **private operator integration packet**, not a new public API, Rust
data-plane replacement, user directory, permission grant or command interface.
The [main plan](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-research-identity-intake-preparation--2026-10-19-asiasaigon)
owns progress and the [08 guide](../../../upgrade_v1.2/EXECUTION_PORTAL_EDGE_UPGRADE_GUIDE_v1.2_VI.md#epg10-08-hoàn-thiện-revocation-scope-và-tls)
owns acceptance. [Bounded qualification](qualification.json) separates isolated
tests, actual read-only observation and operational preparation. Full connected08
is **NOT_MET**;09connected has not started.

**Actual committed preparation,19Oct14:13Asia/Saigon:** receipt schema + exact
NOLOGIN/no-grants role installed and independently read back;0receipt rows,
one connection ceiling. Native guards/old3role caps2/2/1 and provider28445 remain
unchanged. No human mapping, login, writer or business authority was created.

## Correct identities and order

The actual consumer is Research `research-portal.primusspark.com`, source
`/home/bobby/portal-research`, `docs/research-loop-plan`. Stable/main remains the
separate genuine Cloudflare/Portal-security target; dev preview is not the native
consumer. Research and stable use different DBs and Portal subject IDs. Never
copy stable subject, grant, session, trust or private configuration to Research.

1. `observe_existing.py` uses the actual frozen PM entrypoint/private config
   and **ExistingIdentityMappingSource.lookup**. It pins database, physical
   system and source login before a bounded READ ONLY lookup of the genuine
   issuer plus exact Research subject. No guessed username/SQL user seed.
   Actual result: **NO_ACTIVE_EXACT_MAPPING**, not proof that no inactive row
   exists. Unavailable/timeout/configuration error is never NOT_FOUND.
2. The owner approved exactly one schema `elp210_human_candidate` and isolated
   role `ts_portal_research_identity` on TS `live_data_executor`, physical system
   `7674585245102796834`. `receipt_installation.py`/`prepare_source.py` prepare
   the original pinned immutable receipt SQL plus a **NOLOGIN, no-grants role**.
   This stage does not need a human session and preserves both original native
   structural and registry ACL hashes. It does not open identity writer access.
3. Only when Core's reviewed reverse composition, genuine current session and
   same mutations coordinator are available: open the exact finite identity
   ACL/login window and invoke `PortalHumanCandidate` with the real verified
   current-human proof. Do not recreate/reactivate an inactive TS user.
4. Resolve physical COMMIT/readback and signed terminal ACK before using the
   returned mapping. Then install the separately approved Research READ policy
   and independent Core STREAM policy. Neither follows from a UUID or role.
   Keep recovery access/listener for UNKNOWN; revoke only after all outcomes
   and jobs are known terminal. Restore the ORIGINAL registry ACL pin.

The original source/control/maintenance roles and provider `10.70.0.2:28445`
remain untouched. Do not invoke native `schema-prepare`, change old ACLs,
disable writer guards, seed memberships or borrow an admin DSN for serving.

## Small identity seam, not a mounted HTTP route

`identity_intake.py` reuses the actual PM verifier/candidate/identity repository.
Its selected context is server-owned issuer, subject, workspace and workload;
the approved bootstrap ceiling here is Paper, not a product-wide profile limit.
It binds the exact request bytes using the existing PM request-digest protocol:

```text
POST /internal/elp210/current-human/identity
{"schema_version":"pma.current-human-identity-request.v1","request_id":"<canonical UUID4>"}
```

That fixed path is a **digest coordinate**, not an installed listener. The
operator supplies the real candidate/trust/transport; nothing starts on import.
Body is closed, duplicate-key rejected and capped at4096bytes. JWT fields, DB
target, grant, subject, callback URL and SQL cannot be supplied in the body.
After official `authorized_identity()` exits, only durable COMMITTED plus
positive terminal ACK can release the TS UUID, decimal-string mapping version
and bounded receipt/correlation fields. UNKNOWN, rollback, failed ACK or
cancellation releases no usable mapping; no underlying exception is serialized.

## Installation safety and verification

Receipt source is the exact existing PM candidate SQL, SHA256
`305ba23619578935696bbcb6ce434b031746280101034f98accee9271d7ae370`.
An independent disposable PG150018 produced receipt catalogue SHA256
`4c38d6ebf0ac9ff2b0e274082b6b6ea895346245ba577114047d8e25668adc63`.
No operational catalogue was adopted as its own expected hash. The preparation
operator requires original reviewed native hashes, owner/physical target,
finite window and an owned connection, then installs atomically with an advisory
lock. Partial, drifted, privilege-bearing or login-enabled roles are refused.
Existing-registry manifests additionally retain their independently approved
registry pin. The original FRESH-native installation does not assert such a
pin: for it, identical transaction-before/after registry hashes prove ONLY
preservation of old ACLs, not admission/authority. This leaves preexisting
read-only readers and parallel peer schema ACLs untouched, never copies a live
hash into a supposed independent trust root. NOLOGIN/no-grants is mandatory.
Catalogue-first lookup order preserves normal PostgreSQL deparsing with the
existing pgcrypto UUID names; no actual function/default/extension is modified.

- `test_identity_intake.py`:14PASS. Real Ed25519 verifier negatives; explicitly
  TEST_ONLY lifecycle doubles for context-exit/ACK/cancellation/output ordering.
  The positive double is **not** a real Core/DB/COMMIT/human qualification.
- `test_receipt_installation.py`:18PASS on fresh actual PG15 transactions and
  immutable/deferred triggers. Covers wrong target/window/native/registry/pin,
  rollback of all new DDL, partial role refusal, real install/idempotency,
  role/trigger drift, pgcrypto false-drift reproduction, explicit distinction
  of reviewed registry pin versus preservation-only evidence, and
  UPDATE/DELETE/TRUNCATE denial. No user/grants seeded.
- All disposable cells/networks/leases removed; no image build/pull/cache added,
  all41 protected runtime tuples unchanged. Actual schema-only preparation is
  tracked separately and is not connected READ/SSE or production-capacity proof.

The tests need the pinned PM source/dependencies and an operator-owned disposable
PG15 cell. Do not run the integration driver against a production DSN: its
database/system checks reject the known operational targets before DDL. Shared
measurement guards and bounded orchestration/cleanup remain mandatory.

## Next connected work, still original08

### Finite identity-role window — independently implemented19Oct

`identity_role_window.py` owns exactly **one** verified official SDK request and
one min0/max1 checked pool. It is private operator glue, not a Python data plane,
HTTP listener, generic role manager or replacement for Core authority. Use the
already-reviewed `role_credentials.py` pure SCRAM helpers from the sibling
`native-db-commissioning` packet; never use its three-native-role finalizer for
this isolated fourth role. No production credential has yet been generated.

Required composition, in order:

1. Core's real reverse client/trust/session and durable recovery listener must
   already be available. Load actual private references only in operator memory.
   Never share this one-shot candidate/credential with another caller/listener.
2. Build `ReceiptPreparation(...,semantic_acl=True)` using the independent PG15
   effective-ACL receipt pin
   `dfe6994059e2c6b29780e28c1f18de32078227203a40d12e0e1e2487ca6bd500`,
   original reviewed native pin/SQL/physical target and finite operator window.
   The historical raw-ACL prerequisite pin remains recorded separately. Effective
   ACL comparison handles PostgreSQL's NULL→explicit owner ACL after GRANT/REVOKE;
   it omits no grants and does not alter a system catalogue or old SDK encoder.
3. `identity_pool(private_dsn,preparation)` creates an empty checked pool. Every
   physical connection, including recovery, must match the exact role/DB/system;
   an owner DSN fails before serving SQL. `IdentityRoleWindow(...)` performs the
   existing verifier/request/selection prepare before any grants or Core ENTER.
4. `open(owner_connection,password)` grants only schema USAGE, ts_users SELECT,
   INSERT(issuer,subject,display_name), UPDATE(user_id) for SDK row locks,
   receipt SELECT/INSERT and pg_control_system EXECUTE. The original immutable
   identity trigger still rejects changing user_id. Status/display/version
   updates, business/native authority, financial, membership and DDL stay denied.
   The role has one connection and 3s statement/500ms lock/10s idle bounds.
   Existing credentials or role drift are never overwritten.
5. `run()` uses the actual SDK context and final COMMIT/ACK checks. A failed
   or uncertain result releases no usable mapping. `recover()` invokes the same
   official fenced readback and real Core terminal ACK, not a new identity run.
6. `retire()` requires SDK-finished + known COMMITTED/ROLLED_BACK + positive ACK,
   the matching immutable physical receipt, no borrowed pool connections, then
   a closed pool and zero role sessions. It restores only this role's exact ACLs,
   NOLOGIN/password NULL/defaults; leaves mapping/receipts/schema/history intact.
   UNKNOWN/unacknowledged/borrowed cases retain recovery. No clock-based expiry,
   force-close, force-revoke or old-role mutation. Ambiguous ACL DDL COMMIT or
   peer catalogue drift is operator readback/review, never an automatic retry.

`test_identity_role_window.py` reuses the18-case PG baseline and exercises real
SCRAM/defaults, exact privilege denials, actual SDK identity/immutable receipts,
lost terminal ACK, UNKNOWN under a real held source fence, safe recovery,
inactive mapping preservation and repeated windows. Its Core endpoint uses
explicit **TEST_ONLY** keys/ACK fixtures: this is NOT genuine Core/current-human
or connected08 acceptance. See [bounded measured results](qualification.json).

Core owns its new registered schema/release overlay/current session and reverse
listener. Bind only that reviewed actual composition. This packet supplies no
preview session and does not reset a password, stop Research, deploy stable,
start command07 or claim publisher03/capacity01+06. Genuine finite reads, stream
frames, cache/cursor revocation and recovery must still run on connected pins.
Do not rerun unchanged historical gates to manufacture connected acceptance.
