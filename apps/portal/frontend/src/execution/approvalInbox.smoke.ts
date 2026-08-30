/**
 * SMOKE — the Approval Inbox live clock (hi-fi 4a: ages and the next-SLA-breach
 * countdown tick every second). TEMPORARY presentation motion only: every
 * number derives from the server's published `sla.age_minutes` /
 * `sla.budget_minutes`; this hook adds the seconds elapsed since mount so the
 * queue reads as live. DELETE WHEN BR-EX-30/35 ship the governance stream —
 * the tick then comes from server events, not a browser interval.
 */
import { useEffect, useState } from "react";
import { smokeMotionAllowed } from "./smokeMotion";

/** Seconds since mount; 0 forever when motion is off (fixtures, webdriver, reduced-motion). */
export function useInboxTick(): number {
  const [s, set] = useState(0);
  useEffect(() => {
    if (!smokeMotionAllowed()) return;
    const id = window.setInterval(() => set((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return s;
}

/** `26h 14m 32s` — the hi-fi's precise age, from server minutes plus the tick. */
export function preciseAge(ageMinutes: number, plusSeconds: number): string {
  const total = Math.max(0, Math.round(ageMinutes * 60) + plusSeconds);
  const h = Math.floor(total / 3600);
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}h ${m}m ${s}s`;
}
