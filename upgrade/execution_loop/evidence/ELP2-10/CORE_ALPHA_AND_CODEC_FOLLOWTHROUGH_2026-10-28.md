# Research-stage fixture and Core↔Edge follow-through — 28 October 2026

Status: **PARTIAL / source and fixture candidate only**. No runtime install,
READ/STREAM source acceptance or ELP2-10/11 closeout is claimed.

## Research alpha (Claude QA8 N3-05)

Claude `f823705e8` already changed `stage` from PAPER to RESEARCH for an
alpha without deployments, but left `stages=[]`. `readAlphaFleetItem` requires
a non-empty stage list (`apps/portal/frontend/src/execution/api/profileRead.ts`
around lines 708–711), so the Alpha 360 reader still refused the resource.

Core prepared fixture-only candidate `fix/research-alpha-stage-followthrough`
at `837eae444`, based on Claude `b584eb272bc7941061862df3f28502f0717b919e`.
The candidate preserves the declared fixture stages when there are no
deployments, and does not change UI components or guess a stage. A new test
checks every Research-only medium-scale alpha and the actual consumer reader
under plain, workspace and workspace-plus-unknown-deployment queries.
Focused fixture/world-tie tests: **62/62 PASS**.

The built fixture browser executed six Alpha 360 cases (three query forms ×
1280 and 660): all six resource reads returned 200, displayed a readable
Research screen and measured zero horizontal document overflow. See
[browser JSON](RESEARCH_ALPHA_STAGE_BROWSER_2026-10-28.json), SHA256
`fa6ba558c7f8dd8c8e7ab9c96f822ceda224a5977d074f33e8d080989d54b9cb`.
This is fixture evidence only, not actual-source/browser acceptance. The larger
positive journey still recorded `approval: NO_LINK_FOUND`; the Portfolio
screen also logged one `ERR_NETWORK_CHANGED` on a series request. Its 121
numerical ties had no mismatches and two checks were skipped. Do not mark the
full journey PASS or hide the error. No broad link sweep was requested (`0/92`).

**Claude:** integrate/review `837eae444` on your current source; your branch
advanced past `b584eb272` while this ran, so recheck the current diff and
rerun the affected cell rather than replacing your newer fixture file. Review
Approval navigation as UI/fixture-owned QA work. QA8 also records the current
Sandbox/Fleet Grid D blocker and the N8a/N8b/N8c findings; these must not be
represented as closed by the Research-alpha test. Keep cross-screen economic
facts and permission semantics unchanged.

**Landing:** at the measured point Core and Claude changed no identical paths
since merge base `aea89f971`, but Claude contains >130 independent commits and
QA8 has an open blocker. Candidate remains separate; do not blindly treat a
clean textual merge as a validated integration. No push or UI redesign.

## Whole-Core typecheck

On Core `5807f884f`, `timeout 300 flock -n /tmp/portal-heavy.lock npm run
typecheck` returned **exit 124** without terminal diagnostics. This is NOT a
pass and is not evidence of a TypeScript error. A final integration typecheck
and normal hook remain required on the pinned integration candidate.
An independent targeted `tsc --noEmit --strict --skipLibCheck` on the three
Research membership-discovery modules also timed out after 120 seconds (exit
124, no diagnostic); it likewise is **not PASS**. No repeated full gate was run.

## Genuine codec and remaining source gates

The previously reported genuine Core codec export exists at the private
non-Git state path from `CORE_FINITE_RUNTIME_COMPOSITION_2026-10-25.md` and
matches SHA256 `91146ba20bd5dac9fd9407ec21232a7b9e10d1e1f7e680977bceaad5a3e00e87`.
It is codec-only synthetic data, not source authority or a real native grant.
On isolated Edge V2 source `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`, the
previously ignored `genuine_core_codec_export_conforms_without_rewriting_original_bytes`
was explicitly run against that export: **1 PASS / 0 FAIL / 0 SKIP**, exit 0.
The bounded, network-disabled container used image
`sha256:e51d0265072d2d9d5d320f6a44dde6b9ef13653b035098febd68cce8fa7c0bc4`,
2 CPU / 1536 MiB and `cargo test --locked --offline -p edge-service --lib
genuine_core_codec_export -- --ignored --test-threads=1`. This checks genuine
Core codec interoperability, not real network, data, membership or permissions.
Real binding/trust/grants, financial
carrier and same-original STATUS are independent and still require Edge's
qualified inputs. Budget/calibration/G2 and migration on the final pinned
candidate remain open; historical backup preservation is not relabelled as a
new forward-migration or restore receipt.

The Edge V1 gateway **rejects** a numeric revision outside JavaScript's safe
integer range; it does not round it or authorize with a modified value. The V2
lossless string candidate is not installed or joined to a qualified source.
The E3 historical financial carrier remains historical and nullable; it does
not establish economic ownership, complete census or a NET_PNL formula. E5
Canary workload selection must follow its actual contract, not an invented alias.

## Verification and cleanup

The fixture browser JSON was committed separately as an intermediate R1
evidence artifact using the focused browser lane above; it is not the final
R2 integration gate. The full-code typecheck timed out and the normal full
hook was not run for this documentation/evidence-only update. The container
used `--rm`; its absence was checked after the test. Only the two explicitly
created codec/browser temporary directories were removed. The untouched
incoming Edge mailbox files, Claude worktree and shared runtime were preserved.
Documentation verification uses R0 under campaign rule §10.10d: explicit
paths, diff/link checks, and `scripts/execution-tracking-test.sh` (PASS).
