# B9 COMPARE_RC_DATA (items 8, 7, 9)

Base 8bd781ed. FE only; no commit, no server mutation.

## 8 S13 Compare - bound
- `result.pair.chart_annotations` read per run_id (left/right by `pair.runs`): shaded drawdown span + ringed best/worst month on the overlay (token colours, geometry from the overlay's own vertices; drawn only inside the overlay window), per-run text block below the figure.
- Each run labels its OWN scope (OOS window, folds, full/sampled retained); never compared as one truth.
- Title carries origin / scope locator / input digest. Typed absence (reason code) for annotation availability, drawdown, and month extrema (truncated population -> `B9_MONTH_TRANSPORT_...`, no ring).
- Absent field/legacy body: nothing renders (figure unchanged). 503 'unavailable' path untouched.
- Assumption: the drawn drawdown episode is `values[0]` as served (same "episode 1" order as the Report panel). NEEDS-BACKEND confirm that order is deepest-first; FE does no ranking.

## 7 S11 RC - bound
- Seal card hidden only when the served flag says own draft sealed (`seal_blocked_reason=P21_ALREADY_SEALED`); a peer's run-level pack no longer hides it. Editor `editable` = served `may_edit_draft` only (dropped the `delivered`/peer-pack lock).
- Immutable original retry: `retrySeal()` replays the clicked request byte for byte (button on refused seal: unavailable/conflict).
- Typed post-seal refusal: PortalApiError exposes no `details.reason_code`, so after the 409 re-read the notice prints the served `P21_ALREADY_SEALED` flag + sentence. NEEDS-SHARED (lib/api.ts): expose `details.reason_code` to print it straight from the 409 body.

## 9 S02 data declaration - bound (optional) / typed-absence
- `verified_range` + `earliest_start_with_warmup_utc_ms` parsed only when published (no key otherwise). Earliest start taken from the warmup-carrying window only, feeds the existing EarliestStartOffer (also from the bar-metadata fallback); refusal copy for a refused window adds `verified A -> B` + tooltip. Preflight/declaration-estimate earliest still wins.
- No selector added for VN source-reader proof / unqualified profiles.
- 400 problem bodies (datasetClient `refused`) carry only the code: no remediation facts exist there.

## Tests
Fixtures changed to new-server semantics: `sealed()` in releaseCandidateDetail.test (typed builder, own flags); S13-U31 reads the Sharpe reason from the fixture (moved in 8bd781ed). New: B9-S11-A/B/C, B9-S13-A/B/C, HMD remediation (3) in dataDeclaration.b7.test.
