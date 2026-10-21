/**
 * The Fleet stream chip table and the folder's hygiene (ELP2-09; FIXTURE_LAB, unit).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { initialStreamState, type StreamCause, type StreamPhase, type StreamState } from "../realtime/scopedStreamMachine";
import { FLEET_STREAM_CHIP_WORDS, deriveFleetStreamView, type ViewExtras } from "./fleetStreamView";
import type { TransportStatus } from "./fleetStreamTransport";

const EXTRAS: ViewExtras = { accepted: true, notOffered: null, refusalCode: null };
const state = (phase: StreamPhase, over: Partial<StreamState<unknown>> = {}): StreamState<unknown> => ({ ...initialStreamState<unknown>(), phase, ...over });
const view = (s: StreamState<unknown>, transport: TransportStatus, extras: Partial<ViewExtras> = {}) => deriveFleetStreamView(s, transport, { ...EXTRAS, ...extras });

describe("the chip", () => {
  it("has exactly three words", () => {
    expect(FLEET_STREAM_CHIP_WORDS).toEqual({ live: "Live", paused: "Paused", stopped: "Stopped" });
  });

  it.each(["idle", "loading"] as const)("%s: no chip (an absent chip is not a state)", (phase) => {
    expect(view(state(phase), "idle").chip).toBeNull();
  });

  it("live: Live only while the connection is open", () => {
    expect(view(state("live"), "open").chip?.kind).toBe("live");
    expect(view(state("revalidating"), "open").chip?.kind).toBe("live");
  });

  it("live: the first connection attempt shows nothing, a later one is Paused", () => {
    expect(view(state("live"), "connecting", { accepted: false }).chip).toBeNull();
    expect(view(state("live"), "idle").chip).toBeNull();
    for (const transport of ["connecting", "backoff", "paused", "ended"] as const) {
      expect(view(state("live"), transport).chip).toMatchObject({ kind: "paused", reasons: [], startOver: false });
    }
  });

  it("resync_required: Paused while the machine re-reads, Stopped with Start over when it is held", () => {
    expect(view(state("resync_required", { inFlight: { token: 1, epoch: 1, purpose: "resync" } }), "idle").chip?.kind).toBe("paused");
    const held = state("resync_required", { cause: { origin: "frame", code: "STOPPED" } as StreamCause });
    expect(view(held, "idle").chip).toMatchObject({ kind: "stopped", startOver: true });
    expect(view(held, "idle").chip?.reasons).toEqual(["The stream was stopped.", "STOPPED", "Nothing is retrying by itself; retry when ready."]);
  });

  it("access_revoked: Stopped, rejected, no Start over, and the sign-in step", () => {
    const chip = view(state("access_revoked", { cause: { origin: "frame", code: "ACCESS_CHANGED" } }), "idle").chip;
    expect(chip).toMatchObject({ kind: "stopped", flag: "rejected", startOver: false });
    expect(chip?.reasons).toEqual(["Your access to this scope changed.", "ACCESS_CHANGED", "Sign in again or request access."]);
  });

  it("unavailable: a stream that was never offered is neutral and names the finite code; a failure is attention", () => {
    const none = state("unavailable", { cause: { origin: "local", code: "STREAM_NOT_OFFERED" } });
    expect(view(none, "idle", { notOffered: "STREAM_AUTHORITY_NOT_GRANTED" }).chip).toMatchObject({
      kind: "stopped", flag: "na", startOver: true, reasons: ["This read has no live stream behind it.", "STREAM_AUTHORITY_NOT_GRANTED", "Nothing is retrying by itself; retry when ready."],
    });
    const failed = state("unavailable", { cause: { origin: "local", code: "SNAPSHOT_FAILED" } });
    expect(view(failed, "idle", { refusalCode: "EXECUTION_READ_NOT_AVAILABLE" }).chip).toMatchObject({ flag: "attention", reasons: ["The read did not complete.", "EXECUTION_READ_NOT_AVAILABLE", "Nothing is retrying by itself; retry when ready."] });
  });

  it("a Stopped chip always carries a reason; Live and Paused never do", () => {
    const causes: StreamCause[] = [
      { origin: "local", code: "RESYNC_LIMIT" }, { origin: "local", code: "SNAPSHOT_MALFORMED" }, { origin: "frame", code: "RECONNECT_LIMIT" }, { origin: "frame", code: "SOURCE_UNAVAILABLE" },
    ];
    for (const cause of causes) expect(view(state("unavailable", { cause }), "idle").chip?.reasons.length).toBeGreaterThan(1);
    expect(view(state("live"), "open").chip?.reasons).toEqual([]);
  });
});

describe("the folder", () => {
  const files = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.testbase\.ts$/.test(name));
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("reads the files it polices", () => {
    expect(files).toEqual(expect.arrayContaining(["fleetStreamTransport.ts", "fleetStreamSession.ts", "useFleetStream.ts", "FleetStreamChip.tsx", "sseSplitter.ts", "fleetStreamView.ts"]));
  });

  it("opens no EventSource, WebSocket or beacon, runs no interval, touches no storage and writes no console", () => {
    for (const name of files) {
      const source = strip(readFileSync(join(__dirname, name), "utf8"));
      expect(source, name).not.toMatch(/\b(EventSource|WebSocket|XMLHttpRequest|sendBeacon|setInterval|requestAnimationFrame|localStorage|sessionStorage|indexedDB)\b|document\.cookie|\bconsole\./);
    }
  });

  it("names no motion switch: a stream is not motion (smokeMotionAllowed / reduced motion do not gate it)", () => {
    for (const name of files) expect(strip(readFileSync(join(__dirname, name), "utf8")), name).not.toMatch(/smokeMotionAllowed|prefers-reduced-motion|navigator\.webdriver/);
  });

  it("calls fetch in the transport and the session's barrier read only", () => {
    const callers = files.filter((name) => /\bfetch\b/.test(strip(readFileSync(join(__dirname, name), "utf8")).replace(/fetchImpl|typeof fetch/g, "")));
    expect(callers.sort()).toEqual(["fleetStreamSession.ts", "fleetStreamTransport.ts"]);
  });

  it("sets timers only in the transport (backoff) and through the injected clock elsewhere", () => {
    const setters = files.filter((name) => /\bsetTimeout\b/.test(strip(readFileSync(join(__dirname, name), "utf8"))));
    expect(setters).toEqual(["fleetStreamTransport.ts"]);
  });
});
