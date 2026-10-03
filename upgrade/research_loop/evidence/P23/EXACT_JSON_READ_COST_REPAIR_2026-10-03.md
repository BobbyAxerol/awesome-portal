# P23 — exact-current JSON read-cost repair

2026-10-03 · Codex · **SOURCE_TESTED / CLEAN_RUNTIME_RETAKE_PENDING**.
This is the affected Report/RC continuation, not full P23/P24 or a new phase.
Preserve the [original non-reuse proof](./NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md),
all failures, source seals and Claude frontend. No remote/production action.

## 1. First clean repair — actual result, not a claimed PASS

Source `4b845a3a` landed through the normal hook: 1,889 Control PASS and one
existing named skip. The Control-only build succeeded; exact image
`sha256:bb8ff7fa58f179436677c4077c03597024064e54ba57d76c4b65075de4730016`.
Six other owned images, all clone volumes and shared :8095 stayed unchanged.
The helper's final assertion failed on the order of two identical shared
mounts. A separate read-only sorted-mount reconciliation verified identities,
restart counts, source/compiled bytes and health; no rebuild/restart to hide it.

Actual affected load: twenty distinct existing isolated QA actors,
**120/120 GET 200**, exact linked proof, job/proof counts unchanged:

| Read | Requests | p95 | Existing target | Verdict |
| --- | ---: | ---: | ---: | --- |
| Report | 60 | 541 ms | 500 ms | FAIL |
| RC | 60 | 1,752 ms | 500 ms | FAIL |

Peak seven-service memory: **416,944,128 bytes**, all cgroup bounded.
Private `linked-report-read-load-clean.json` SHA-256
`44fb5296db32f3035bd32ec14dc10ebff853ec904fad494053497fcad814002a`.
Earlier 547/1,710-ms failure stays separate. No SLO waiver.

## 2. Evidence-driven minimal continuation

Current-role SQL planner/execution: main source 2.652/0.957 ms;
fold rows 0.131/0.077 ms. The new bottleneck is repeated synchronous
schema/canonical work, not another missing index. RC fingerprints cover
approximately 505 KiB, retained lane approximately 500 KiB per request.

- Compute one source fingerprint, one Report verification and one seal
  revision batch per request; no duplicated canonical passes.
- Preserve former canonical JSON bytes with an independent old-algorithm
  oracle, including numeric/Unicode keys and literal `__proto__`.
- Memoize only successful **pure calculations on the exact current JSON**:
  canonical digest, retained-lane facts, schema/companion validation and
  public Report representation. Changed current bytes, run/revision,
  annotations or linked proofs miss the memo even with a claimed same digest.
- Read large RC JSONB fields as text in the existing fresh RLS snapshot,
  decoding identical current text once. This is not a cached SQL/source read.
- Bound each of nine owners to **32 entries / 4 MiB encoded UTF-16 /
  30-second TTL from insertion**; LRU and oversize bypass. Resource limits
  remain unchanged. Private cloned deeply frozen plain JSON may bypass
  repeated shape walking/encoding; caller shallow freeze/getters are never
  trusted. Exact fresh retained-lane interning happens only after all RLS
  queries; every changed JSON fact misses. Encoded-text/key retention is
  included in the conservative byte budget.
- Every request still checks current membership and reads current DB facts,
  draft/publication/parent-child/proof authority. No actor/grant/lease cache,
  prepared actor plan, hidden compute or mutation.

No new DTO, hash algorithm/version, financial semantics, migration, profile,
UI/design/baseline, budget, old seal or artifact byte change. Old declared
absences remain typed; no per-fold target is flattened into a global audit.

## 3. Focused validation / exact acceptance bar

The coherent ten-file affected group passed **125/125** before the last
native-JSON/decode refinement. Build plus final canonical/memo group passed
37/37 after fixing TypeScript narrowing. Decode/P04/WFO/repository regressions
passed 72/72; final build plus memo/canonical 40/40 passed after the private
frozen-text fast path. The last interning/output-bypass refinement and the
normal grouped hook must finish before source landing; clean runtime
HTTP remains unaccepted until its own new receipt passes 500 ms.

Tests retain canonical golden fingerprints and Report/P04/WFO/source revision
parity; changed bytes/same advertised digest, changed run/binding/annotation,
TTL/LRU/byte bounds, caller mutation and unsupported JSON bypass. Existing
RLS membership and verified-parent/child negative tests remain enforced.
Standalone process profiles are attribution only, not HTTP SLO evidence.

Only Control API is rebuilt after the coherent commit. Compare actual clean
source/compiled hashes and all seven image identities; preserve the other
six services and volumes. Retake Report/RC with the same twenty QA actors.
Do not rerun accepted Library/Progress, P22, JSON502, engine or restore cases
merely because a historical board row still says pending.

## 4. Frontend handoff / cleanup / full remainder

Generated `researchLinkedFinalAuditGetV1` / `researchLinkedFinalAuditCreateV1`
and additive `linked_final_audit` are published. Product Research frontend
currently has no references to either. Claude: consume the named read;
explicit POST only with `may_create`, exact target digest and idempotent
intent. Never create on mount or change the promoted parent selection.
Do not claim the existing API proof is a product-button browser receipt.

Owned :8096 and 21 newly created isolated QA actors are retained solely for
the affected retake. Then revoke/disable exactly these actors, stop the
owned cell without `-v` and record C4. Preserve clone/proof-restore data,
original bytes, failures/backups/current/rollback images. No broad prune.

OPEN after this source repair: actual affected-read acceptance and exact
candidate aggregation/cleanup; original three historical manifest bytes
or Bobby disposition (**83/86 strict integrity remains false**); genuinely
qualified second engine T07/T13/P24-T05; whole P24 scenarios/field/actions,
owner acceptance and signed-release rehearsal. No frontend edits, shared
:8095 worker changes, dev/main merge, push or production deployment.
