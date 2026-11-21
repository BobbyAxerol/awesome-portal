# P23 dependency-scoped evidence reconciliation

GOV-C3, 2026-10-15. This additive tool does **not** change `qualify.mjs`,
rerun a workload, produce `P23_QUALIFIED`, authorize release, or manufacture
fifteen same-image PASS receipts. It is an offline custody/source-scope matrix.

## Use and stopping point

```bash
node scripts/research-p23/reconcile-evidence.mjs \
  /absolute/private/reconciliation-input.json \
  /absolute/private/reconciliation-output.json

# Focused verifier tests only: no Docker, network, DB or engine.
node scripts/research-p23/reconcile-evidence.test.mjs
```

Input is an existing regular 0600 JSON file; output is created 0600 with
exclusive-create, never overwritten. Missing/invalid/changed scopes still
produce an explicit matrix and exit 1. Exit 0 means all supplied canonical
requirements have a reconciliation disposition, **not product qualification**.
All fifteen T rows are emitted; omitted origins are `UNVERIFIED`. There are no
flags to ignore failures, missing raw files, dirty dependencies or scope drift.

Git operations are read-only. Bounded object-ID stdin uses one private temporary
directory per batch, removed in `finally`; no worktree, runtime or evidence is
deleted. Repository blobs are SHA-256 hashed in bounded Git batches, including
file names/modes and additions/deletions. Current scoped files must match the
checked-out candidate commit. Untracked scoped files fail closed. Existing
strict qualification and every owner/release gate remain separate.

## Input contract

Top-level fields:

- `schema_version`: `research.p23-evidence-reconciliation-input.v1`.
- `repository`: canonical absolute Git worktree root.
- `evidence_roots`: 1–16 narrow existing absolute evidence directories. No
  symlink component; evidence files must remain confined regular private files.
- `candidate`: full checked-out `source_sha` and `runtime` descriptor below.
- `gates`: up to fifteen unique canonical `P23-T01`…`P23-T15` rows.

Each gate row contains `gate_id`, a meaningful human `scope`, `origin`, and
`evidence` (1–32 actual supporting file references). `additional_paths` can
widen the code dependency scope using literal repository-relative paths; it
cannot remove the reviewed minimum policy or contain globs/path traversal.

Every file reference is `{locator, sha256, bytes?}` with an **actual** absolute
locator and the expected SHA-256 of the actual bytes. Public Markdown is a
documentation index/owner context, never a replacement for raw measured JSON,
logs, screenshots, fault records or restore proof.

`origin` contains:

- `source_sha`: full existing ancestor commit.
- `receipt`: reference to the actual JSON measurement/gate receipt.
- `gate_id_pointer`: JSON pointer to that receipt's exact canonical T id.
- `result_pointer` / `result_equals`: explicit original success predicate;
  accepted values are `true`, `PASS`, `PASSED`, `SCOPED_PASS`, and
  `READY_FOR_BOBBY_REVIEW`. A false original result requires retake. A generic
  `passed:true` without a gate identity cannot be reused for unrelated T ids.
- `runtime`: actual captured origin identity/config descriptor, not today's.

Both runtime descriptors contain:

- `identity`: file reference and `source_sha_pointer`, `project_pointer`,
  `image_pointers` (1–8 exact `sha256:` runtime image IDs).
- `exact_commit_pointer`: JSON pointer to an **already captured** true fact
  attesting the image was built from that exact committed source. A parent SHA
  or build-before-commit label is insufficient. Do not add a made-up attestation
  to an old identity. Exact COPY input custody must first establish its actual
  commit, otherwise the result stays unverified.
- `config`: reference to the original captured JSON configuration.
- `config_pointers`: map of required logical categories to JSON pointers in
  that actual config: `engine`, `storage`, `security`, `limits`, `features`,
  `database`, `network`. The policy selects categories per gate. These must
  cover the effective engine/toolchain pins, auth/grants behavior, storage and
  pool/quota/cgroup/SLO bounds, applicable flags and network isolation. Missing
  capture is absence, never a default synthesized from current source.

The tool checks these bytes/claims and the declared source/config scope; it
cannot independently prove an old runtime capture was complete or that a
supplied pass predicate covers every behavioral subcase. The reviewer still
owns that mapping. Config values/raw evidence are not copied into the result;
only paths, lengths, digests, runtime image IDs and scoped hashes are recorded.

## Dispositions

| Disposition | Meaning |
| --- | --- |
| `REUSED_VERIFIED` | Older gate-bound raw evidence, runtime identity, config and source dependency bytes verified unchanged for the explicitly named origin scope; not a new execution or same-image qualification. |
| `AFFECTED_RETAKE_VERIFIED` | Verified evidence explicitly bound to the current commit; not a claim that all other gates ran with it. |
| `RETAKE_REQUIRED` | Original failure, relevant source addition/deletion/change, or relevant config difference. Preserve old failed attempts. |
| `UNVERIFIED` | Missing/tampered/unbound raw evidence, source/config/identity ambiguity, dirty candidate, absent selector, symlink, public file or unsupported scope. |
| `APPROVED_EXCEPTION` | T06 only, exact historical exception receipt + measured 83/86 population + exact three known artifact/digest identities. No byte recovery or strict-integrity PASS. |

The historical exception uses `historical_exception` on T06 with `receipt`,
`population`, `verified_pointer`, `missing_pointer`. Receipt must be the
existing `research.p23-historical-test-loss.v1` assessment; population points
to the raw verified count and missing-manifest records. A fourth/new loss,
changed digest or `full_store_integrity_passed:true` is rejected. This accounts
only for those historical test artifacts, not a newly corrupt artifact or
new published dependency. Output always preserves strict historical **83/86**
and `full_store_integrity_passed:false`, separately from another restore's
69/69 fresh-volume population.

## Minimum source policy for this continuation

The 60 literal selectors are exported as `RECONCILIATION_POLICY`; they all
resolve in the continuation baseline `051eeb89`. Shared groups are actual
runtime/package/config/Postgres profiles, confined worker/domain, P05 storage
and migrations, fresh authority/admin/workspace/database pools, Research and
Execution read/contract surfaces, Governance/publication, and browser sources.
Each gate also includes its own real measurement harness. Full scopes are
deliberately conservative; an optimization that removes a dependency needs
review and a versioned policy, not a per-run override.

| Gate(s) | Source groups beyond runtime baseline | Required action for GOV-C1/C2 |
| --- | --- | --- |
| T01 | worker, storage, authority, reads, Governance | Auth/Governance/new migration invalidate relevant mixed-load coverage; a small functional test is not a 20-principal latency retake. |
| T02/T03 | worker, storage | Reuse only if actual worker/storage/migration/config bytes and the corresponding origin proofs match; new migration forces explicit review/retake. |
| T04 | worker, storage, authority | New authority/migration paths require affected outage/recovery proof. |
| T05 | storage, authority, reads, Governance | Retake changed gate/auth/plan/apply/isolation and affected file/export paths. |
| T06 | worker, storage, authority, Governance | Preserve distinct populations and historical exact exception; changed migration/reference behavior must be checked. |
| T07/T13 | worker, storage, reads | Reuse exact qualified fixed-Delta two-version scope only if dependencies/config unchanged; never infer new WFO/native version support. |
| T08/T09/T11/T12 | respective exported authority/read/worker scopes | Preserve unchanged measurement only with its original limits/cold-cache/isolation/quota/seek workload, not an arbitrary later numerical result. |
| T10 | all app/contract/worker/authority/browser scopes | Current grouped affected-domain regression remains needed; fixture verifier tests alone do not close T10. |
| T14 | worker, storage, authority, reads, Governance | Retake new decision/reference audit lineage and protected-data behavior; old restore does not prove a newly added approval. |
| T15 | same as T14 plus browser | Claude must consume actual new contracts and take affected browser receipt; no automatic reuse of old R1-only UI coverage for R2/Live. |

This policy does not infer a capability from test results or enable upstream
SSE/Execution commands. A Portal-local R2/Live decision remains separate from
Trading System risk grants, account capital and live deployment.

## Existing evidence cautions / exact next use

UDB-04 `closeout-index.json` is an index, not the raw load receipt. At inspection
on 2026-10-15, private `identity.json`, `inputs.json`, and `mixed-load-final.json`
exist under `acceptance-closeout-20261011`, but the identity's `source_candidate`
is **734f5c36**, the parent before the coherent commit. Its Control image has
the recorded **550-file COPY inputs digest
`2e318ff7a5dec92779dafe6a5d9d4ee1573970ad8433bf54a957cc5059b260b1`** in
the closeout packet. Do not simply compare the parent Git tree with today's
tree and call that actual-image provenance. The exact committed COPY match
must be established first; a missing original config capture remains absent.

After GOV-C1/C2 land coherently, capture the exact new candidate's actual
identity/config. Bind origin receipts to their real gate/scope, then run this
tool. Keep `UNVERIFIED` entries if their private artifacts, gate identity,
exact-build source or captured config are absent. Give the resulting affected
gate list to the focused retake/Claude consumer lane. Do not regenerate old
raw measurements, insert fake JSON success or hash this README to close them.
The maximum result here is a reviewable **reconciliation**, not P23/P24 final
acceptance, Bobby visual approval, signed manifest or deployment.
