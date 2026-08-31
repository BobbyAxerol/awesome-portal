/**
 * Presentation clock utilities — no business facts. Moved out of
 * `approvalInbox.smoke` for N29-FE-01 §8: product screens tick real server
 * ages with these; the smoke module re-exports them for the lab.
 */
import { useEffect, useState } from "react";

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
