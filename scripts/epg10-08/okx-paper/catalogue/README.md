# OKX Paper catalogue package (PAPER_OKX_SWAP / OKX): how it was built (2026-11-18)

Real Rust tool: branch `feat/catalogue-paper-okx-swap-20261118` (commit 2d36d085, on e035cfee), binary `target_catalogue_candidate` sha256
`73a42c979af71d2936c5db74d19360ad8679089d87a6de08bda02b16f3adad4b`, built offline in `rust:1.83-slim` with toolchain 1.85.1 (`--locked --offline`), run one capped network-less
container per call (`run-tool.sh`, runtime = Manager image 8d4765a4). `gen_okx.py` is the pipeline as it was run (paths are the author's scratch paths): base-49 installed candidate
+ the 13 T1 relations + the five shared references (as the live Paper 67), then `refresh_m0` with profile id and venue. `t1_t2_gen.py` is the relation-entry generator it imports.
`RESULTS.json` = its output: per case the sha256 of the five files, seal, relation counts, and three checks:
- BINANCE with the OLD tool (e035cfee) and the NEW tool are byte-identical in all five files and equal the files installed on Paper (seal `4f38c58f...`);
- the existing proposal pair PAPER_OKX is unchanged between old and new tool;
- PAPER_OKX_SWAP is the new set in `../artifacts/paper-okx-swap/`.
Inventory: `../inventory/trading_system.columns-pk-uq.2026-11-18.txt` (read-only psql, `BEGIN READ ONLY`, sha256 `c09d3a9e9f29b3c257de302ded3bd193961ddcbcf8dae7f32f0341986d37aff7`) is byte-identical to the 16 Nov dump the Paper 67 were built from,
so no column of any of the 67 relations changed (and none was added since).
