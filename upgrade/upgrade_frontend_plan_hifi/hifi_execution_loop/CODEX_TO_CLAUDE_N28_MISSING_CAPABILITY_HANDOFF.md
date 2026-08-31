# Codex → Claude — N28 Missing-Capability Handoff

Status: `N28_COMPLETE / SOURCE_DARK / TYPED_UNAVAILABLE_RETAINED`

Claude can work against this product truth:

- ticks, crypto/VNM candles, current venue sessions, benchmark series and
  cross-profile drift now have canonical source adapter contracts, but N29 has
  not connected them to a released screen BFF;
- current Gateway events are order-lifecycle-only and poll-bounded; do not
  label them a complete event stream;
- `inspect`, `performance`, `broker-read`, `portfolio-create` and
  `risk-profile` are N27 reclassification candidates, not connected actions;
- portfolio-create and risk-profile remain explanatory disabled until N29
  provides the complete command plan/apply/verify authority;
- Redis inspect and hard-reset controls must not be shown as Portal actions.

The nine genuine missing capabilities remain typed unavailable with the exact
N28 reason codes from
`services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/missing-capability-registry.v1.json`.
Do not replace them with fixture success, `updated_at`-derived broker latency,
partial-population exposure verdicts or client-side signal/intent joins.

Frontend parallel lane before N29:

1. render honest `partial`/`unavailable` states for the nine owner gaps;
2. keep current event completeness visible in incident/timeline surfaces;
3. ensure candle/tick/chart panels tolerate empty and bounded windows;
4. retain disabled explanations for N27 candidates rather than dead buttons;
5. consume only TypeScript BFF routes when N29 publishes them—never call
   Gateway, Market Data Layer or AWS-HK directly from the browser.

No visual redesign is required by N28. Existing approved Carbon execution
design and typography rules remain authoritative.
