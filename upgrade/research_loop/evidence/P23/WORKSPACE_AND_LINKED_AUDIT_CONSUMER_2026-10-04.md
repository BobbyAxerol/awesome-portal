# P23 — S09/S11 workspace and linked-audit consumer

2026-10-04 · Codex · **AFFECTED_FRONTEND_READ_ACCEPTANCE_PASS**.
Owner assignment: Codex implements this frontend logic/data-binding slice;
Claude is not waiting to implement it. No full P23/P24 or release GO.
This later amendment preserves the [previous 404 receipt and diagnosis](./CURRENT_CANDIDATE_CLOSEOUT_AMENDMENT_2026-10-03.md).

## Scope and implementation

- `ReportRoute.tsx`: explicit `workspace_id` reaches Report, export and
  visibility reads. `ReleaseCandidateRoute.tsx`: the same scope reaches
  Library/status, composition, draft/seal/publication and pack operations.
  Containers key on workspace plus identity: held reports, ETags, draft/write
  state and obsolete requests cannot leak across workspace navigation.
- `runLinks.ts`, `reportClient.ts`, `releaseCandidateClient.ts`, Report/RC
  composition: preserve scope alongside existing revision, query and cursor
  hashes, including `#pack` redirects. Never guess a workspace, search all
  memberships, widen RBAC or treat a URL scope as authorization.
- `linkedAuditClient.ts` consumes the existing generated
  `researchLinkedFinalAuditGetV1` / `researchLinkedFinalAuditCreateV1` types.
  Validate parent/child/target/profile/state/proof identity and the qualified
  zero-optimizer result. Only named same-origin requests, session/CSRF and
  server `may_create`; no raw server prose, DB/CLI access or invented facts.
- `useLinkedAudit.ts` / `LinkedAuditConsumer.tsx`: one GET on arrival;
  explicit re-read and confirmed POST only. No auto-compute/poll/retry.
  S11 shares its writer lock; immutable pack is read-only. Lost-response
  retries retain the original intent and target. Stale responses are fenced.
  Existing CSS is reused, with a supplemental `no-print` audit custody area;
  frozen print core, panel-order contract, seals and financial values unchanged.

## Tests and actual evidence

**285/285** focused tests across eleven affected suites PASS, including
twenty new workspace/audit tests. TypeScript check PASS. Official web
Docker build (Node 22) PASS. No manual rerun of unchanged full Control/load/
engine/restore suites; their previously accepted exact scopes are inherited.

Actual restored-proof browser at **1280 and 660**: S09 and S11 **4/4 PASS**.
Run `rrun_3258a4c450816129d2d285f25b801061`, authorized explicit workspace
`ws_06GCVTHWC9WVPGEPR85AB15K82`, normal fresh QA account. Named Report/RC
responses are 200, original frozen Report and actual VERIFIED audit proof
match; scoped child-progress link is exact. No overflow/page error or
out-of-origin request; hard refresh/navigation issues GET only, unchanged
job count and immutable proof/report custody. Foreign workspace refuses.
No fixtures, route interception, HAR or response rewriting in this lane.

`#pack` redirect, scoped export/write operations, double-click/idempotent
retry and refusal matrix are focused contract/component tests. The restored
R-WFO-020 parent has no local RC pack, so **this browser receipt does not
claim an actual pack redirect or fresh POST/button-to-child allocation**.
The existing original-parent backend POST/P05/restore acceptance remains
accepted separately; a complete P24 action matrix is still open.

HiFi source HTML for S09 and S11 was opened in Chromium at both widths;
reference captures and real product captures retained privately. Rich
composition, styles and frozen panel order are retained. No visual baseline
re-record, CSS/token change or owner visual approval is claimed.

Private root:
`/home/bobby/.local/state/portal-research-p23/20261003/nonreuse-r020`.

| Evidence | SHA-256 | Scope |
| --- | --- | --- |
| `workspace-audit-browser-20261004-attempt02.json` | `2f3171575abfb46005ebcc0b0eaef532275599c3a07ba118f8e22f20fc0ef86f` | Actual 4/4 scoped Report/RC, proof and cleanup |
| `workspace-audit-hifi-reference-20261004.json` | `6a62cf9bbaa1e4e21be02a18bd94931eff4157f42543af48e401c39114c31d4c` | Four browser reference captures, not pixel/owner acceptance |
| `workspace-audit-completion-capacity-20261004.json` | `a6c6956725c4f6afaef77ef1e14403cab3adff0df5785b9193bc1a7eb498bde2` | Exact C4 / unchanged shared worker |
| Earlier `workspace-audit-browser-20261004.json` | `4506bc5dad6f689732c75a7ee540ec3b708575ddb7234b7873838eb70aa6761a` | Harness setup FAIL: Compose provenance env `unknown`; 0 product routes |

The earlier setup failure stays intact. Retake preserved the unchanged
Control image's verified `128276d7` stamp, not the frontend working HEAD.
No backend source/image rebuild. Captured frontend image:
`sha256:1191dde6e869e41d80670ffddc43d829027853b41314c0d149c065a5838d6146`;
bundle `/assets/index-CloiB-zT.js`, byte SHA-256
`76b40df4456c5b0f73d2f2b56e9fdbade43af7b99f9c197e37e957f407e1c1e4`.
Source-input hashes and exact reused images are in
[unsigned candidate amendment v4](../P24/current-source-candidate-manifest.v4.json).
The web was built from the pending slice before its grouped commit; record
that honestly, not as a clean signed release. Exact source inputs are pinned.

Log hashes: affected tests
`4f397a9589588ab281ce4f21ca66ad873b1e8d9af32344ee432154cfb1dafe7a`;
Node-22 web build
`699bc96c9138f06338b08b0cb044fd16de370b80c80c0376044b94804f08fbac`.

## C4 and independent gates

Both fresh QA accounts (`p23-reader-98`, failed setup;
`p23-reader-97`, accepted retake) are **DISABLED**, all their sessions revoked.
Original owner anchors/Bobby/Stan/Thanhvuong are unchanged. Worker stayed
OFF. Owned :8096 containers/network **0**; shared :8095 worker ID unchanged.
All source/restore volumes, archives, exact current/rollback images retained.
Disk free **192,913,944,576 B**, free RAM **12,708,552,704 B**;
cleanup `NO_ACTION_NEEDED`, no broad prune.

Original-byte investigation additionally checked exact three artifact IDs,
read-only/network-none, in `portal-research-e17_portal-artifacts`,
`portal-probe_portal-artifacts`, `portal-research-p23-ol12_portal-artifacts`,
`portal-stable-v1-0-1_portal-artifacts` and `portal_portal-artifacts`.
Both probes exit 0 with **zero matching manifest paths**. Prior archive
507-manifest digest search remains valid; it was not rerun. No reconstruction,
reseal, deletion or replacement bytes were created. **Strict integrity 83/86**.
Bobby has been asked for another original backup or an exact-three-run scope
exception; this assignment itself is not that exception.

Existing engine inventory still has only qualified **1.1.1**. Different
same-wheel image IDs do not satisfy T07/T13. Published 1.1.0 is an available
qualification candidate, **not a Portal-qualified second pin**. Bobby has been
asked to choose a supplied second release/pin or isolated historical 1.1.0
qualification followed by upgrade to 1.1.1. No default/profile/production
engine changed; T07/T13/P24-T05 remain open until actual qualification.

Full P24 scenario/field/action/visual/print/owner acceptance and signed release
remain separate. No remote push, dev/main merge, shared preview or Production
operation. Next: resolve the two owner inputs, then run only their affected
gates and finish the existing P24 denominator, not a new campaign.
