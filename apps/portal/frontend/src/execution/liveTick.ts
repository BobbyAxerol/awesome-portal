/**
 * Presentation clock utilities — no business facts. Moved out of
 * `approvalInbox.smoke` for N29-FE-01 §8: product screens tick real server
 * ages with these; the smoke module re-exports them for the lab.
 */
import { useEffect, useState } from "react";

import { useNow } from "./listMotion";
import { smokeMotionAllowed } from "./smokeMotion";

export function useInboxTick(): number {
  const [s, set] = useState(0);
  useEffect(() => {
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return s;
}

/** `26h 14m 32s` — precise age from server minutes plus the local tick. */
export function preciseAge(ageMinutes: number, plusSeconds: number): string {
  const total = Math.max(0, Math.round(ageMinutes * 60) + plusSeconds);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

/**
 * Seconds elapsed since this screen mounted, for ticking a *real* server age.
 *
 * `useInboxTick` is gated on `smokeMotionAllowed()`, which is off under
 * `prefers-reduced-motion`. That is right for a demo ticker and wrong here: an
 * approval's SLA age is information, not decoration, and freezing it for a
 * reader who cannot tolerate movement hides an approaching deadline from
 * exactly the person who has no other way to see it. The animation stays off
 * for them; the number keeps counting.
 */
export function useAgeTick(): number {
  const now = useNow();
  const [mountedAt] = useState(() => Date.now());
  return Math.max(0, Math.floor((now.getTime() - mountedAt) / 1000));
}
