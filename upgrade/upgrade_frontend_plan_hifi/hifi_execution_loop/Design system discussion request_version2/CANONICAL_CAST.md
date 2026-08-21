# CANONICAL_CAST.md
> The one sample-data cast every screen and doc must agree on. Sample data only — shaped by `uploads/DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`. If a hi-fi screen disagrees with this file, this file wins; fix the screen.

## Portfolios
| id | base ccy | note |
|---|---|---|
| PF-CRYPTO | USDT | primary demo portfolio (360°, canary, live) |
| PF-MAIN | USDT | R2 / allocation / drawer demos |

## Alphas → versions → deployments
| Alpha | Version | Deployment | Venue | Mode/Stage | Account | Gate ids |
|---|---|---|---|---|---|---|
| Grid | v2.1 (av_2041, sha256:41bb…) | dep_88 | BINANCE | LIVE_CANARY day 9/14 | acct-canary-grid | R1 AP-118 · R2 AP-152 · PX-22 · SX-14 · canary gate AP-311 |
| Grid | v2.1 | dep_91 | OKX | SANDBOX_VALIDATION (HALTED) | acct-sbx-grid-okx | — |
| Grid | v2.1 | dep_94 | DERIBIT | PAPER_OBSERVATION 30/30 gate met | acct-paper-grid-drb | paper exit EX-771 (pending) |
| Grid | v2.1 | dep_live | BINANCE | LIVE_FULL since 2026-08-01 | acct-live-grid-v21 | canary exit CX-08 · live gate AP-330 |
| Carry | v3.2 | dep_74 | BINANCE | PAPER_OBSERVATION 12/30 · 184/300 | paper-binance-carry-v32 | R1 AP-101 · R2 AP-207 |
| Carry | v3.2 | dep_77 | OKX TESTNET | SANDBOX cert 5/7 | acct-sbx-carry-okx | PX-29 · pending R2 AP-352 (→PF-MAIN) |
| MM | v1.1 | dep_63 | BINANCE | LIVE_CANARY | acct-canary-mm-v11 | R2 AP-259 (conditions) · PX-31 |
| VnMomo | v0.9 | dep_101 | VN MARKET | PAPER 6/30 sessions | paper-dnse-vnmomo | R1 AP-322 · R2 AP-338 |
| RSI | v1.7 (RC-41) | — | — | research, R1 pending | — | AP-201 (quorum 1/2) |
| MeanRev | v0.3 (RC-52) | — | — | research, blocked | — | AP-360 (audit replay failed) |

## Broker bindings
| external_account_ref | Venue | Credential | Linked virtual accounts |
|---|---|---|---|
| binance_main_01 | BINANCE | BIN-01 VALID | acct-live-grid-v21 (18,400) · acct-live-carry-v32 (14,900) · acct-canary-mm-v11 (7,700) — Σ 41,000 vs physical 43,120 |
| binance_testnet_main | BINANCE testnet | BIN-T1 | sandbox accounts (shared, NET) |
| okx_main_01 | OKX | OKX-01 VALID | acct-sbx-grid-okx, acct-sbx-carry-okx |
| deribit_main_01 | DERIBIT | DRB-01 EXPIRING | paper only (no live binding yet) |
| dnse_main_01 | VN MARKET | DNSE-01 OTP flow | paper-dnse-vnmomo |

## Known resolutions (former screen drift)
- acct-live-grid-**bin** (old 1f) → canonical **acct-live-grid-v21**.
- dep_91 OKX = **Grid v2.1** sandbox (HALTED, Alpha 360°); the Sandbox Certification screen shows **Carry v3.2 dep_77** — two different deployments, both valid.
- Incidents: inc_44 (MISMATCH, open) · inc_31 (BROKER_STALE, resolved) · inc_28 (REJECT_SPIKE, resolved). Operations: op_1249–op_1254 as in Ops Queue/Incident. People: Stan (operator admin), Lan (quant reviewer + ops approver), Minh (quant reviewer), Risk (dual-approval role).
