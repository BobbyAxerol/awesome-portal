# C4/C5 — actual owner-request delivery, 21 October 2026

Later actual return: [PM ACK + NET_PNL rules](PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md)
at PMc0095d12. PM07/PM target/NET_PNL now ACKNOWLEDGED; selected-producer wire
mapping and installed qualification remain open. TS03/other-target ACKs are not
inferred. The delivery-time ACK_PENDING state below is historical.

Status: **SENT / OWNER_ACK_PENDING**, completed06:19 UTC. Four public packets
were read/reviewed locally, copied only to absent exact destinations over
approved SSH, then SHA256 read back. Receiving Unified journals contain narrow
additive links; no existing packet/source/config was overwritten. Prepared
NOT_SENT text inside each frozen request describes its pre-delivery state;
this receipt and the receiving journal entries establish actual delivery.

## Payload pins

| Request | SHA256 | Intended answer |
| --- | --- | --- |
| [PM07](PORTAL_TO_PM07_REQUEST_2026-10-21.md) | `d2c1665dd66019a6894cfce1ccb9d20d084b7053c0f3ccdd05219c79fb25f576` | First commissioned operation/environment/native target, authenticated submit/status, held-COMMIT/recovery and current-recall read |
| [TS03](PORTAL_TO_TS03_REQUEST_2026-10-21.md) | `b328fb5a6392a88f0b8c5b38e3616043f7a996d15364859b6a639da5425e5078` | Admitted publisher, additive fence preserving migration59, actual quiescence/coverage/checkpoint evidence |
| [Target01/06](PORTAL_TO_TARGET0106_REQUEST_2026-10-21.md) | `7c89e1844f7d3801b72f5bb9a9656ef438d98f6e19c7689558de8824d49d5369` | Named roster, already approved numeric bounds or explicit proposal, measured-window inputs; no load started |
| [NET_PNL ownership](PORTAL_NET_PNL_OWNERSHIP_QUESTION_2026-10-21.md) | `b5255e54203956f626b7b02e33ee3a3274e5db94b50b46f262965ae8bf36a4c8` | Account snapshot vs disjoint allocation/event grain, authoritative keys and duplicate/distinct/conflict examples |

## Actual receiving channels

All remote paths are on AWS HK, not local aliases:

- PM `/home/bobby/.worktrees/trading-system-pm-v1_1/upgrade/`: PM07, target01/06,
  NET_PNL. Unified `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md:84904`,
  heading `Portal C4/C5 owner intake — 21 October06:17 UTC`.
- TS-next `/home/bobby/.worktrees/trading-system-next-upgrade/upgrade/`: TS03,
  NET_PNL. Unified `TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md:3`,
  heading `Portal owner-request intake — 21 October06:17 UTC`.
- Edge `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/`:
  PM07 in `EPG10-07/`, TS03 in `EPG10-03/`, target01/06 in `EPG10-06/`.
  Unified `upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md:28087`,
  heading `Core operator/coordination return — 21 October06:17 UTC`.

All eight packet copies matched the four hashes above. The target request is
delivered to PM and Edge's existing target-owner channel; **no direct separate
DL owner ACK is claimed**. Owner answer/commissioning/budget approval remain
separate from receiving files. PM/TS/Edge source pins at readback remain
`e2efd91b` / `0cd356da` / `276536c2` with their existing WIP preserved.

The Core R3 diagnostic was separately delivered into original `EPG10-08/`,
SHA256 `1fcc5367119c743d5c2e03c59a1a89638f01ae3716ba6c0a3f91ddf919bfed25`,
and linked there. It explicitly says no fixed image READY and no terminal ACK.

## Consumer follow-through and boundaries

Claude keeps source/UI ownership; NET_PNL semantics stay **PENDING_OWNER_ANSWER**.
No account-only dedupe or arbitrary sum rule is selected here. Return each
ready owner packet independently; do not wait for all four. Codex reviews the
answer and links exact typed fields/fixtures back to Claude before consumption.

No secret/token/cookie, SQL, runtime mutation, grant, new test, budget approval,
commit/push, deploy or trading action was made by this delivery. Only new public
Markdown and additive journal links were written. No runtime resource to clean.
Original Core recovery remains Codex-only; owners must not duplicate its caller.

## Later actual PM return and delivery —06:40 UTC

The pending-answer status above records the initial send, not current C5 state.
PMc0095d12 now ACKs PM07/PM target/NET_PNL; its source rule is independently
checked in the producer review. [PM return](PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21.md)
SHA256 `aaf25610dda482530c02b2417ae480f15b379d0fe2f2af4a10e65a3b91507312`
is also delivered byte-identically to PM `upgrade/` and Edge `EPG10-03/`.
Edge Unified links the return beside its own actual intake at06:36UTC; source
pin at this later delivery is `1f10816f0dd95686ff427c2ba1ecbffd7576a075`.
No TS03/other-target ACK or financial runtime qualification inferred. Mapping
for the selected producer remains open. Original custody/resources unchanged.
