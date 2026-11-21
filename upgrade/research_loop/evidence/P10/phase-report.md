# P10 phase report — durable New Run producer

Status: `BACKEND_AND_TYPED_CONTRACT_COMPLETE` · Codex · 2026-09-21.

## Delivered authority

P10 exposes two authenticated, same-origin Control API operations:

| Product operation | Method/path | Exact authority |
|---|---|---|
| Install the one reviewed P04 binding | `POST /api/v1/research/run-producer/p04-delta/install` | Active ADMIN + CSRF + workspace membership; identity comes solely from compiled server constants |
| Create/replay a Research run | `POST /api/v1/research/runs` | Active ADMIN + CSRF + workspace membership + caller-owned fresh P08 token + exact immutable P04 binding |

The install operation accepts only an optional workspace selector.  It cannot
upload code, name a source path, choose an adapter, alter an AlphaVersion or
select a child command.  It records the reviewed `p04.delta-rsi.v1` binding
once and replays only the identical record.

The create operation takes a canonical P02 `requested_spec`, opaque P08 token,
client intent and `NEW` intent kind.  It re-hashes the exact submitted spec,
validates the actor-scoped token and current manifest, then re-evaluates the
same predicate advertised by P08 as `may_create_run`.  Any browser value that
tries to assert admission, carry a lease, name a snapshot path or route to a
different child is absent from the public schema and rejected at an earlier
boundary.

One PostgreSQL transaction persists the immutable attempt, logical run,
durable job and `research.run_producers` bridge before the signed private
`POST /api/runs` hop.  A response is `QUEUED` only after the private Portal
route has accepted its NATS publish.  Connection loss is deliberately a typed
unknown outcome, not a fabricated success; the same client intent recovers the
durable record and uses a new fence after its prior lease expires.

## Portal boundary and resource custody

The private Portal route accepts the P10 envelope only when all of these are
true:

- `PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=true` is explicitly set;
- the HMAC principal is valid, unexpired, `ADMIN`, and has the dedicated
  `research_run_producer` authentication method;
- the bounded P10 envelope matches its run, worker-attempt and lease identity.

It publishes only `quant.run.requested.research`.  A dedicated P10 executor is
required; a missing/malformed P10 producer cannot fall through to the legacy
ProcessPool executor.  The API publisher creates no JetStream durable
consumer; only the actual worker does, avoiding idle per-API-replica consumers
and duplicated delivery retention.

The bundle/attempt registry is completion authority in P10.  A terminal
observation publish (`quant.run.succeeded` or `quant.run.failed`) is therefore
best-effort: unavailable event infrastructure is logged but cannot rewrite a
sealed success into `FAILED` or retain duplicate scratch.  P11 owns durable
terminal-event retention, replay and status projection; this rule prevents
P10 from pretending its transient notification is that later authority.

The executor re-checks the sealed P08 snapshot byte hash, streams at most
65,536 rows per Parquet batch into an attempt-scoped warmup+IS+OOS tape, and
structurally excludes every row at or after the OOS end.  It passes only that
tape and a fixed parameter map to the P06 namespace-isolated Delta child.
Temporary tape/scratch files are removed after success, failure, cancellation
or redelivery; committed content-addressed bundle bytes remain intact.

The two P10 JSON files that enter that sealed bundle are deliberately a
sanitized audit projection, not the private worker envelope.  They retain the
canonical requested spec, immutable public digests, reviewed P04 parameters
and child result/resource facts.  They exclude the opaque preflight token,
client intent, job/worker/lease fence, snapshot locator/content hash and work
digest.  Both files are written `0600`; a direct real-child test checks their
shape, permissions and absence of every opaque private value.

## Exact current capability

The installed adapter is intentionally narrow:

```
p04.delta-rsi.v1
strategy: delta-rsi-polynomial-alpha@1.0.0
route: signal_notional
protocol: three_window_decay
parameters: fixed qualification profile
```

The typed `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` state covers P02-rich
input that has no installed runtime mapping yet, including route-specific
parameters, optimization overrides, and non-`NEW` clone/reproduce/upgrade
intents.  The submitted canonical spec is never silently rewritten to make a
form appear accepted.  P12/P19 own the additive versioned adapter/lineage work;
P11 owns structured status, progress and terminal reconciliation.

## Browser declaration and optimizer-default amendment

`BR-P10-01` and `BR-P10-02` are closed at the server contract boundary without
opening a source, worker or runtime-control path:

- every P07 `RegistryEntry` now contains a validated,
  `research.alpha-version-declaration.v1` safe projection: entrypoint,
  1–12 declared timeframes, `determinism.seed_required` and at most 12
  declared parameter definitions. P04's reviewed shorthand ranges normalize
  to the same browser union. Source bytes/paths, binding identity,
  protected-kernel hash, adapter and provenance fields are never projected;
  corrupt persisted JSON returns a typed 502 rather than a guessed declaration.
- the P09 current Atlas release now publishes the exact finite trial ceiling
  (`4000`), four named optimizer-default groups (Study, Sampler, Objective,
  Candidate selection), and current P10 submission constraints. The catalog
  validates the ceiling against the actual certified capability and rejects a
  historical release that carries current-only policy facts.
- all current fields are `RELEASE_DEFAULT` and `LOCKED`. They are explanatory
  release facts, not client-selectable defaults. The separate current P10
  submission constraint remains exact: one trial, no optimizer override,
  early-stop override or random-seed override.

The generated P07/P09 contracts are the only browser inputs for the Spec 02
declaration/sweep/pin/default panels. The Claude handoff records the exact
typed wiring task; no TSX or HIFI composition changed in this backend slice.

## Verification

| Gate | Command | Result |
|---|---|---|
| Immutable binding, preflight admission, durable intent, private-hop replay, loss/recovery | `./scripts/research-loop-v11/test-p10-postgres.sh` | 4/4 pass on a uniquely named disposable PostgreSQL container; trap removes only that container |
| P08 preflight regression after P10 binding lookup | `./scripts/research-loop-v11/test-p08-postgres.sh` | 10/10 pass on a uniquely named disposable PostgreSQL container; validates imported and P10-bound AlphaVersion lookup |
| Real sealed P08 snapshot → actual P06 Delta child; tamper rejection; sanitized artifact projection; exact private ingress; worker isolation/cleanup; terminal-observation loss | `cd apps/portal/backend && PYTHONPATH=src:.. ../.venv/bin/python -m pytest -q tests/test_research_run_producer.py tests/test_durable_worker.py` | 15 passed |
| Control API type/build boundary | `cd apps/control-api && npm run build` | pass |
| Generated named browser contract | `cd packages/contracts && npm run generate:research-run-create && npm test` | generation pass; 143/143 pass |
| Global route ownership ledger | `cd apps/portal/frontend && npm test -- src/execution/r2Ledger.test.ts` | 22/22 pass |
| Unchanged P02 facade/regression | `./scripts/research-loop-v11/test-p02-compatibility.sh` | static contract pass; 63/63 pass in disposable PostgreSQL proof |
| Diff hygiene | `git diff --check` | pass |

### Visual-gate root-cause evidence

Commit `7441c572` broadened the Portal Tailwind content scan to the complete
embedded Planning source tree. That made the generated Portal CSS depend on a
sibling feature tree, which is an invalid cross-feature build boundary whether
or not a given browser happens to render a visible shift. The repair restores
the Portal-local scan and retains only the reviewed shared Planning primitives
in an explicit safelist (including the lazy `feature-loading` fallback). It is
guarded by a static unit test; no snapshot was re-recorded and no visual
threshold was weakened. The affected Planning Board matrix passes unchanged.

The final immutable Chromium run is deliberately recorded accurately: **220
passed / 28 screenshot mismatches**, not a false all-green claim. Three are
the `planning-reports` one/two-pixel Mermaid differences that reproduce from a
clean temporary worktree at baseline commit `6a712c53`; they therefore predate
this repair. The other screenshot-only mismatches are existing cross-product
baseline/renderer follow-up, not inputs to this backend/contract change and
were not re-recorded or threshold-masked here. They require a dedicated visual
owner decision with a pinned browser/font evidence capture before any baseline
refresh. This keeps the gate honest while removing the unsafe global Tailwind
scan that made diagnosis impossible.

### Environment-only legacy runner observation

The pre-existing `tests/test_run_api.py` default execution tests cannot launch
their existing `forkserver` `ProcessPoolExecutor` in this Codex sandbox:
the host returns `PermissionError: [Errno 1] Operation not permitted` before
legacy worker code runs.  `run_service.py` was not modified by P10, and the
P02 current-source facade proof above passed.  This is not masked or relabelled
as a P10 pass; deployment/dev validation must run the normal legacy runner in
an environment that permits `forkserver`.  P10's own actual isolated child
proof passed in this environment.

## Rollback

Keep both `FEATURE_RESEARCH_RUN_PRODUCER=false` and
`PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=false` to keep intake dark.  A rollback
does not delete immutable P10 attempts, jobs, bindings, producer rows or sealed
bundles.  Disable only the new UI route/client once it exists; retain legacy
`/api/runs` unchanged.
