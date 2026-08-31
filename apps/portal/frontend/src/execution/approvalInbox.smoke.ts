/**
 * SMOKE — the Approval Inbox live clock (hi-fi 4a: ages and the next-SLA-breach
 * countdown tick every second). TEMPORARY presentation motion only: every
 * number derives from the server's published `sla.age_minutes` /
 * `sla.budget_minutes`; this hook adds the seconds elapsed since mount so the
 * queue reads as live. DELETE WHEN BR-EX-30/35 ship the governance stream —
 * the tick then comes from server events, not a browser interval.
 */

/** Seconds since mount; 0 forever when motion is off (fixtures, webdriver, reduced-motion). */

export { preciseAge, useInboxTick } from "./liveTick";
