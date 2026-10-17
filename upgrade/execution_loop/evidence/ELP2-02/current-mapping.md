# ELP2-02 — current own-profile mapping follow-through

2026-10-17, approved [backend02–11 batch](../../../UNIFIED_IMPLEMENTATION_PLAN.md#elp2-backend-gap-batch-02-11).
Canonical request remains ELP2-REQ-00-003; no duplicate debt ID. Backend
IN_PROGRESS / UNCOMMITTED until the recorded normal-hook landing. Frontend
NOT_STARTED_BY_OWNER_DIRECTION / AWAITING_CONSUMER_REVIEW.

## Entry, ownership and implementation

`/home/bobby/portal-research`, `docs/research-loop-plan`, entry
`8ba33de3cf2cb91a4d58bf7421c6b7b4fc5ce462`. Preserve recovery/docs WIP and
independent Regime math in its two separate files. Primary owns profile source,
UsersRepository read, AppModule DI, generator/fixtures/generated types/tests and
shared tracking. No migrations, frontend, runtime flags, source installation,
real user/grant changes, push, dev/main merge, release/deploy or Live command.

- Reuse the installed `AccessTrustProvider.verifiedHumanMapping` callback; do
  not create a second provider, grant engine or browser source selector.
- GET/PATCH `/api/auth/profile` optionally accepts only `workspace_id`; omitted
  context means personal workspace. Current membership is required before
  lookup; another workspace returns404, even for a named ADMIN/owner. Retained
  business visibility is not an arbitrary identity-discovery entitlement.
- `OwnProfileProjection` obtains one fresh mapping for the authenticated own
  user only. UUID/revision/closed payload validation; errors are sanitized typed
  absence, not reflected source copy. No positive mapping cache or polling.
- Final user/status/archive/password/generation/session expiry/membership check
  is one SQL snapshot after external I/O. DB clock expiry, no Core lock held
  across source I/O. A revoked context discards the positive response.
- A TS mapping is not a researcher binding, business membership or command
  grant. Researcher identity remains UNMAPPED pending its independently verified
  fact. Owner recovery remains deliberately disabled. Mapping absence does not
  turn an applied/replayed display-name receipt into a failed write.

Independent security review found the initial three-read final fence could
straddle revocation; fixed before testing by
`UsersRepository.findCurrentSessionInWorkspace`. No relaxation of lifecycle
authorization/CAS/idempotency. No default installed mapping or invented TS user.

## Contract and future Claude handoff

Regenerate: `npm --prefix packages/contracts run generate:portal-profile`.
OperationIds unchanged: `portalOwnProfileGetV1`, `portalOwnProfilePatchV1`;
generated `components["schemas"]["OwnProfile"]` at
`packages/contracts/generated/portal-profile.d.ts` gains additive TS identity
union and optional workspace query context. Consumer must exhaust states:

| State | Published fact / meaning |
| --- | --- |
|UNMAPPED / MAPPING_SOURCE_NOT_QUALIFIED|No installed mapping callback; not a negative business entitlement|
|UNMAPPED / MAPPING_NOT_PUBLISHED|Installed callback has no mapping observation for this exact context|
|UNMAPPED / MAPPING_SOURCE_UNAVAILABLE|Source error or malformed fact; public copy must not claim identity absence|
|MAPPED|`ts_user_id`, `mapping_revision`, `workspace_id`, `observed_at_utc_ms`, `source_locator`; current own observation only, not TS-effective time or grant|

Canonical synthetic fixtures: `portal-profile.synthetic.valid.json` and
`portal-profile.mapped.synthetic.valid.json` in `packages/contracts/fixtures`.
These are TEST_ONLY schema examples, never installation/grant evidence.
New400 `PROFILE_QUERY_INVALID` and404 `PROFILE_WORKSPACE_NOT_FOUND` keep the
existing `ProfileProblem` envelope. Both responses and errors remain no-store.
PATCH body stays display_name/expected_revision only; no identity mutation.

Claude later: map the discriminated union, keep researcher/rights separate,
preserve selected workspace through own-profile read/edit, show source absence
without zeros/fuzzy names. Existing accepted UI is unchanged here. No consumer
assignment/acknowledgement or browser PASS is implied by this handoff.

## Validation, resources and exit

New disposable PG/mounted HTTP suite `elp202-profile-mapping.spec.ts`: positive
DI/default-unqualified/null/error/no-cache, exact workspace and cross-user
refusals, no lookup before authority, revoke during I/O (membership/session/
generation/lifecycle/archive), DB-time expiry while final query is delayed,
malformed provider facts and PATCH receipt on mapping outage. Contract suite
adds mapped/unmapped union and strictness checks. Existing identity/session/
lifecycle suites are impacted regression gates. Source TLS correctness reuses
the peer's pinned103-case focused receipt; it is not genuine authority proof.

At preparation: generation and `git diff --check` PASS; tests/build **NOT_RUN**.
One Core heavy lane≤4CPU/4GiB/8GiB transient; no HK workload under its verified
foreign G12 window. Only owned ephemeral cells are cleaned. Rollback unmounts
the additive projection and preserves users/bindings/owner/grants, revocation
generations, applied/UNKNOWN mutation receipts and all audit history.

Backend next: source-compatible per-resource/environment acceptance and exact
installation under03/10, not the rejected latest-receipt shortcut. This closes
the local always-UNMAPPED projection defect after tests/landing; actual TS and
researcher mapping qualification and full02 product exit are not yet complete.

### Focused gate — 2026-10-17 13:07Asia/Saigon

Disposable PG + mounted HTTP production-build gate PASS:19 own-profile mapping,
18 existing identity,22 recovery fault-boundary and17 actual loopback-mTLS
regressions =76 relevant identity/recovery tests,0FAIL/SKIP. The same run also
executed51 initial Regime math cases (127total); independent review subsequently
found temporal/numerical/archive defects in that unrelated draft. Its51 green
cases are **not Regime acceptance**, nor part of this profile contract's count.
No fixture provider is labelled real PM mapping installation.

Receipt controller and log:
`/home/bobby/.local/state/portal-execution-elp210/20261017/profile-recovery-focus-060405/`.
Log sha256 `4a1fa80e5f5db038e6acd2776ff8c8d62e0df2e36f008a2f70910b09be2d8d92`;
API build and PostgreSQL restore/digest checks PASS. Actual Node/PG caps3GiB/
1GiB, aggregate≤4CPU; all owned containers/network/window removed. Eight
protected runtime image/start/restart tuples unchanged. No frontend build,
source workload, production DB read/write, flag/install or service change.
Normal-hook contract/full-regression landing remains mandatory; its terminal
receipt, exact staged blobs and commit will establish delivery, not this focus.

The corrected[Regime calculator](../ELP2-06/regime-calculator.md) is included in
the same backend follow-through normal-hook commit to avoid a second complete
gate solely for that private foundation. Its source/calibration/worker/public
API remain incomplete and are not conflated with the delivered profile union.
