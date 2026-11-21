# E13 — explicit reproduction and persisted three-level lineage

Date: 2026-09-27 · branch `docs/research-loop-plan` · Codex backend.
Verdict: **BACKEND_REAL_API_ACCEPTED · S10_CONSUMER_BROWSER_PENDING**.
This extends, rather than deletes, the earlier sibling/clone records.

> **Later consumer acceptance:** S10 browser reads the persisted root/clone/
> reproduction depths 0/1/2 at 1280 and 660 through the existing attempt
> deep-link. Reproduction conflicts are terminal, not an automatic new-intent
> retry. [Final integration proof](../P17/E11_E17_INTEGRATION_ACCEPTANCE_2026-09-27.md)
> supersedes the pending consumer statement, not these immutable API receipts.

## Scope and authority

Read: Unified E13/P19, P19 README and phase-report, the complete E13 sibling
closeout/addendum, P19 guide and §5.5–5.7, and Research working rules A13.
No frontend file, Execution implementation, Trading System, production flag,
shared preview :8095, main/dev or remote was changed.

The existing P10 command now accepts `REPRODUCE_EXISTING` only with the explicit
`REPRODUCTION_OF.parent_run_id`. Clone, reproduction and diagnostic sibling
are mutually exclusive. Parent resolution and insertion share one scoped
transaction. Missing/cross-workspace parents are non-enumerating 404s; no
timestamp, current active version or metric is used to guess a parent.

Reproduction compares 13 immutable input pins: AlphaVersion, engine release,
requested spec, effective spec, dataset binding, preflight manifest, snapshot
identity/content, work identity, adapter identity/contract and profile
identity/digest. A changed pin is refused before any attempt/job insert.
Missing historical producer pins are not backfilled or replaced with defaults.

The public attempt preserves `REPRODUCE_EXISTING`; the established private
worker operation remains `NEW`. Same-intent retries replay its durable record,
not another attempt. The original run/report stays immutable. Upgrade-engine
admission remains separately typed refused, not silently treated as reproduction.

### Environment limitation is public, not hidden in prose

`RunCreateResponse.reproduction` publishes `parent_run_id`,
`pin_scope=IMMUTABLE_INPUT_PINS` and typed environment equivalence:

```json
{
  "state": "NOT_PUBLISHED",
  "reason_code": "P10_RUNTIME_IMAGE_DEPENDENCY_EQUIVALENCE_NOT_RECORDED",
  "source_locator": "research.run_producers.v1:engine_release+adapter+execution_profile"
}
```

The existing producer record does not archive full runtime image/dependency
equivalence. Input reproduction therefore does not promise historical image
recreation or bitwise equality for unseeded optimization. The actual worker
image stayed unchanged in this proof, and both image IDs are in the private
receipt. No nonexistent source fact was filled with a sample value.

## Real API receipt — two new bounded HMD runs, no direct engine invocation

Owned cell: `portal-research-e17`, loopback `http://127.0.0.1:8098`.
Historical data: approved read-only reader, `crypto-binance-1m`, BTCUSDT 1h.
Engine: installed/pinned QuantBT 1.1.1; P04 fixed-qualification profile.
IS: 2026-06-01 → 2026-06-08; OOS: June 8 → June 15;
sealed holdout June 15 → June 17 remains outside compute.

| Actual run | Meaning | Persisted parent |
| --- | --- | --- |
| `rrun_71d45ff4b86492bb5f526e272fcb5112` | Existing immutable root | unchanged |
| `rrun_d9fcdb76659132495676f30e2c986709` | New parent-bound clone | root attempt |
| `rrun_de49e40d12f458aeab9e19ad4ff8f284` | New reproduction | clone attempt |

Both new runs completed and materialized through the real P08 → P10 → confined
child → P05 retention path. The named S10 API returns all three nodes together,
their exact `parent_attempt_id`, public intents and primary-run pins.
Reproduction has `semantic_diff.state=AVAILABLE`, zero changes; matching
engine/effective-spec/dataset/profile pins come from persisted rows.

Positive/negative results:

- clone/create retry and reproduction/create retry: same run, `replayed=true`;
- total logical-attempt count increases by exactly two, not four;
- valid new preflight with changed IS start: public 409
  `RESEARCH_RUN_REPRODUCTION_CONFLICT`, no added graph node;
- nonexistent parent: public 404 `RESEARCH_RUN_NOT_FOUND`, no added graph node;
- original frozen Report deep-equal before/after;
- restart **only** Control API, re-read the same IDs: all node fields/counts
  and original frozen Report equal, with no new child compute.

Private evidence directory is `/home/bobby/.local/state/portal-research-e17/20260927/`;
files are 0600 and are not committed:

| Receipt | SHA-256 | Result |
| --- | --- | --- |
| `e13-api-b2a8df6c-bab9-433f-a1a5-7113c81d9357.json` | `44cefc47d7d9d1e7da5dcf261fc81bc11813c5fb9edaa4c904cf29e5914f5fb4` | real graph/negative matrix PASS |
| `e13-api-4797b131-fdda-435f-b547-063604585cd5.json` | `8819b9624efd7b21fe3914e83ec6b467d8d4db918b9ceac37a86f93611ae4dc2` | restart parity PASS |

Qualification Control API image:
`sha256:ce3644478a1d4898c33141d7a6fde1b41c8eca229bd1b412dc64fab9840e8eef`.
This is a dirty-source test image based on `0ab62994`, not a signed release.

## Tests and failures kept honest

- Run-create Zod/profile focused suite: **43/43 PASS**; canonical OpenAPI,
  generated client and JSON Schema pairing tests: **3/3 PASS**.
- Disposable PostgreSQL `research-w5a-migration.spec.ts`: **4/4 PASS**:
  exact parent, immutable original, idempotency, each valid altered input pin
  rejected transactionally and no residual attempt; malformed profile rejected
  earlier at admission. Existing sibling tests remain intact.
- Invalid profile digest is **400 RESEARCH_INVALID_INPUT**, not 409. A different
  valid fixed profile is **409 RESEARCH_REPRODUCTION_BINDING_CONFLICT**. An earlier
  incorrect test expectation and an incorrect literal profile name both failed;
  tests now import the source constant and assert the two real refusal layers.
- First API helper attempt expected HTTP200 at POST preflight; the actual
  controller is HTTP201 (create is HTTP202). It failed before creating a child,
  remains a FAILED private receipt, and is not counted as product acceptance.
- Control API compile, generated types and diff whitespace checks: PASS.
- Mandatory pre-commit result is reported by the actual commit transcript;
  focused counts above are not a claim about the entire repository suite.

## Consumer handoff and cleanup

Generated type: `research-run-create.d.ts`, `RunCreateRequest.lineage` now
includes `REPRODUCTION_OF`; safe public error includes
`RESEARCH_RUN_REPRODUCTION_CONFLICT`. Keep clone copy and reproduction intent
distinct. Never infer missing historical parents, claim bitwise equivalence,
or turn worker retry count into user-visible graph nodes.

Claude owns the rich S10 browser/HiFi receipt; no new UI composition is authored
here. The real persisted graph is ready for that consumer.

Disposable PG used a unique `portal-e13-proof-*` name, bounded tmpfs/512 MiB,
and `--rm` plus an EXIT stop trap. Inventory confirms none remains. After the
real runs worker CPU is 0%, RSS ~95 MiB; Control API RSS ~59 MiB. No volume,
business data, rollback image or global cache was pruned. Named follow-up:
retain this owned :8098 cell only for E16 qualification, then stop the exact
project while keeping its private receipts and required data volumes.
