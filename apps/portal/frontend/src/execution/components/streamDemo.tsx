/**
 * A subscription walked through its whole lifecycle, as a fixture.
 *
 * The Command Center is phase 9 and blocked, but its *subscription* is shared
 * with every live screen, and the states worth getting right are the unhappy
 * ones — which are exactly the states a screenshot of a working system never
 * shows. So the lifecycle is driven here instead: subscribe, snapshot, deltas,
 * a dropped event, a rebuild with the server's wait, then recovery.
 *
 * It drives the real reducer. A demo with its own state machine would prove
 * that the demo works.
 */
import { useMemo, useState } from "react";

import {
  INITIAL_SUBSCRIPTION,
  mayResnapshot,
  subscriptionReducer,
  type SubscriptionEvent,
  type SubscriptionState,
} from "../subscription";
import { SubscriptionBanner } from "./stream";

/** A fixed clock, so the wait window is demonstrable without a real one. */
const NOW = "2026-08-21T10:44:00Z";

interface Step {
  label: string;
  event: SubscriptionEvent;
  /** Why this step is here — the thing a screenshot cannot say. */
  note: string;
}

const WALK: Step[] = [
  {
    label: "subscribe",
    event: { type: "SUBSCRIBE" },
    note: "Nothing may render as live until a bounded snapshot lands.",
  },
  {
    label: "snapshot",
    event: { type: "SNAPSHOT", epoch: "ep_7f21", sequence: 8810, asOf: "2026-08-21T10:42:01Z" },
    note: "Live. The resume token is epoch:sequence, exactly as §7.4 specifies.",
  },
  {
    label: "delta 8811",
    event: { type: "DELTA", epoch: "ep_7f21", sequence: 8811, asOf: "2026-08-21T10:42:06Z" },
    note: "Contiguous. Still live.",
  },
  {
    label: "delta 8814 — three missed",
    event: { type: "DELTA", epoch: "ep_7f21", sequence: 8814, asOf: "2026-08-21T10:42:19Z" },
    note: "A discontinuity. The surface goes stale and the resume token is voided, because a reconnect that resumed with it would skip the hole silently.",
  },
  {
    label: "re-snapshot",
    event: { type: "SNAPSHOT", epoch: "ep_7f21", sequence: 8820, asOf: "2026-08-21T10:42:30Z" },
    note: "Recovery is a snapshot, never an interpolation across the gap.",
  },
  {
    label: "projection rebuilt",
    event: {
      type: "EPOCH_CHANGED",
      epoch: "ep_8a03",
      resnapshotNotBefore: "2026-08-21T10:45:00Z",
    },
    note: "A new epoch voids every cursor from the old one. The server assigns when this client may re-snapshot; a hundred clients doing it at once would hit a projection whose caches are cold because it has just been rebuilt.",
  },
  {
    label: "disconnect",
    event: { type: "DISCONNECTED" },
    note: "The last good values stay on screen, marked. A blank would be worse: an operator can act on a number they know is old.",
  },
];

export function SubscriptionWalk() {
  const [step, setStep] = useState(0);

  const state: SubscriptionState = useMemo(
    () => WALK.slice(0, step + 1).reduce((s, w) => subscriptionReducer(s, w.event), INITIAL_SUBSCRIPTION),
    [step],
  );

  const current = WALK[step];
  const blocked = !mayResnapshot(state, NOW);

  return (
    <div className="exec-walk">
      <div className="exec-walk-steps" role="group" aria-label="Subscription lifecycle">
        {WALK.map((w, i) => (
          <button
            key={w.label}
            type="button"
            className="exec-walk-step"
            data-active={i === step ? "true" : undefined}
            data-done={i < step ? "true" : undefined}
            aria-pressed={i === step}
            onClick={() => setStep(i)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <SubscriptionBanner state={state} now={NOW} />

      <div className="exec-walk-note">{current.note}</div>

      <dl className="exec-walk-state">
        <div>
          <dt>phase</dt>
          <dd>{state.phase}</dd>
        </div>
        <div>
          <dt>resume token</dt>
          <dd>{state.resumeToken ?? "voided — a resume here would skip"}</dd>
        </div>
        <div>
          <dt>freshness</dt>
          <dd>{state.freshness}</dd>
        </div>
        <div>
          <dt>may re-snapshot</dt>
          <dd>{blocked ? `not before ${state.resnapshotNotBefore}` : "yes"}</dd>
        </div>
      </dl>
    </div>
  );
}
