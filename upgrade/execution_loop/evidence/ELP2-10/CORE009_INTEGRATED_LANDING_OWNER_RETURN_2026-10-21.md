# Core009 integrated source landing — owner return, 21 October 2026

**ACTUALLY_LANDED / SOURCE_ONLY / NOT_INSTALLED / NOT_CONNECTED_READY.**
At16:33 UTC the sole integrator completed a clean, **ff-only** landing on
`/home/bobby/portal-research`, branch `docs/research-loop-plan`:

- Previous canonical: `610de62f5ee3ec6d51684e15c246ff81fe22299e`.
- Landed source: `218b94280e1994ce3c40cae3c08c261f7fc52c13`.
- Landed tree: `20e7ffaaff651563d25f76a7eb0c3075e865c186`.
- `git diff 432da03d HEAD -- . ':(exclude)*.md'` is empty: qualified code,
  tests, schemas, contracts, JSON receipts and runtime definitions unchanged.
- Canonical clean after landing. Both parent histories retained; no force
  operation, remote push, dev/main merge or runtime change.

The460 existing integration commits now reachable from canonical are **not
460 new implementations written this round**. They preserve the accumulated
reviewed Claude/Core history. Net landing from old canonical:1,508 files,
+295,244/-7,285, including historical guides/evidence/assets. The actual
Markdown reconciliation from tested432 was11 files/+1,264/-0; two append
conflicts retained both sides, with preservation checks documented below.

## Qualification delivered independently of fresh commissioning

[Actual integrated normal receipt](CORE_INTEGRATED_NORMAL_GATE_RETURN_2026-10-21.md)
SHA256 `c121b4f5de653ce5c0e66b2286633db77424176d390669f16e1f998d92851a48`:
source432/tree0bf50d86,15:38:11–16:28:03UTC, EXIT0; contracts1,629PASS,
API9,740PASS/7SKIP/0FAIL, build and scoped PostgreSQL restore PASS. Exact test
containers/network absent; heavy slot released. No duplicate full gate for
documentation-only successors. This is not a new product image or real-traffic
receipt; image05ae remains the earlier qualified, uninstalled transport image.

## Claude: next work and integration boundary

1. **ACT_NOW:** [ELP2-REQ-10-010 finite successor writer/CAS](CORE009_SUCCESSOR_AUTHORITY_REQUEST_2026-10-21.md).
   Frozen/landed source has no official successor manager-domain grant path.
   A legacy resource-selector proposal is not a ManagerDomainGrant and must
   not be used as a workaround. Keep all expired/revoked grants/history.
2. Dark Fleet refresh cancellation remains on Claude's existing handoff.
   Wire the reread AbortSignal and cancel refresh-owned requests on unmount/
   scope change; do not enable its dark flag just to get a receipt.
3. [Measurement review](CODEX_MEASUREMENT_QUIET_AND_RECEIPT_REVIEW_2026-10-21.md):
   focused timeout tests, original receipt bytes and additive interpretation;
   Canary cause UNKNOWN. No full M-1 rerun requested for documentation.
4. Post-freeze branch `claude/post-freeze-20261021` at371224f0 is preserved and
   not silently merged. Do not rebase the whole already-integrated campaign
   or force-reset that branch: the integrator carries reviewed post-freeze
   slices only. Share new successor/cancellation source SHA as soon as ready.

## Edge/PM: partial return and remaining inputs

Edgecc7e71f5 already ACKs010/NOT_READY. Proposed16:30–17:00 source slot is
**NOT_STARTED**, fresh acceptanced0a7b78a remains absent/unarmed, old head4
revoked. Do not install a short-lived source while waiting for Core. A fresh
viable window and actual config/image/authority pins follow the qualified
successor writer; this source landing is **not** that commissioning ACK.

Original custody recovery is settled; no new attempt, retired-head replay or
fake terminal/ACK. Existing final-egress/authority facts remain reusable within
scope; [cache correlation request](CORE009_NATIVE_OBSERVATION_REVIEW_AND_CLAUDE_REQUEST_2026-10-21.md)
does not hold otherwise eligible READ. STREAM requires separate current grant.

At16:27:52 readonly source cut: PMd47b4df9 adds immutable-history/dual-native
comparison42PASS source-only, generation writer still unfinished. It does not
supply financial economic-source wire mapping or qualify production financial
inputs. Manager public staging still has no issued leaf/chain or controlled
issuer return; [specific PKI-owner request](CORE009_MANAGER_PKI_OWNER_REQUEST_2026-10-21.md)
remains open. Approved production numeric bounds/calibration, matched
coexistence/G2 and browser acceptance stay separate. No ELP2-11 entry.

**Verification: R0** for this owner return: explicit Markdown paths, tracking,
diff/link checks. Normal qualification is the actual pinned run above, not
skipped, predeclared or repeated. Cleanup preserves images, data and evidence.
