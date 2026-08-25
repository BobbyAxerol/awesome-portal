# Review guide — 10 phase Execution Loop V2 (để Bobby ký §7 acceptance)

Dev-portal: `http://127.0.0.1:8080` (stack `portal`, build `feat/execution_loop`, preview bật). Mỗi dòng: route → nhìn gì → baseline tương ứng trong `apps/portal/frontend/e2e/execution-journeys.spec.ts-snapshots/`.

| Phase | Route | Nhìn gì | Baseline |
|---|---|---|---|
| V2-00 | mọi route | không còn 2 surface; một workspace Carbon; preview strip 1 dòng | `el-v2-00-*` (before) |
| V2-01 | `/research/quantbt/*` vs `/execution` | Research light, Execution Carbon — đổi theo route, không theo profile | 101 QuantBT không đổi |
| V2-02 | `/execution/_fixtures#v2-anatomy-paper-demo` | 7 primitive, type ramp 11/12/13/14/15/24, 3 layout | crop `v2-anatomy-paper-demo` |
| V2-03 | bất kỳ route preview | click mọi control: đổi state / điều hướng / simulated ledger — 0 no-op | `controls.json` |
| V2-04 | `/deployments/paper/dep_94`, `/governance/exit-reviews/EX-771`, fixtures `v2-equity-chart-demo` | masthead·strip·chart honest·tabs·rail; chart thật ở fixtures (zoom/reset/expand/table/export) | `el-v2-04-*` |
| V2-05 | `/governance/approvals`, `…/AP-201/r1`, `…/AP-352/r2` | bar quyết định sticky; SLA bar; PLAN PREVIEW một chip; Request changes disabled + lý do | `el-v2-05-*` |
| V2-06 | `/deployments/paper/dep_vnm/vn-market`, `/deployments/sandbox/dep_77`, `/deployments/live/dep_88/canary`, `/deployments/live/dep_live` | timeline phiên VNM; 1 band đỏ Canary/Live; MISMATCH thay chart; protective vs risk khác chỗ | `el-v2-06-*`, crop `v2-guard-asymmetry` |
| V2-07 | `/execution`, `/execution/operations`, `…/incidents/inc_fixture_44`, `/administration/actions` | ranked list trước fleet; rail theo dòng chọn; terminal §9.2 (fixtures `commandplandrawer`); không break-glass | `el-v2-07-*` |
| V2-08 | `/deployments/alphas/av_2041` (+`?tab=Insight+Charts`), `/deployments/portfolios/PF-CRYPTO?tab=Structure+%26+Correlation`, `/deployments/accounts/acct-live-grid-v21`, `/deployments/blotter` | 12 tile không khung trống; heatmap→lens + influence map; triptych; footer M7 | `el-v2-08-*` |
| V2-09 | `/execution` (badge stream), acceptance doc | SESSION EXPIRED / SOURCE LOST typed (test), rollback rehearsal, parity report | `V2_RELEASE_ACCEPTANCE_2026-08-24.md` |

Ký ở §7 của `V2_RELEASE_ACCEPTANCE_2026-08-24.md`. Từ chối phase nào → ghi lý do vào dòng đó; tôi sửa và tái sinh baseline của đúng phase.
