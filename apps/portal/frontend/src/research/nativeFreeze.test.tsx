/**
 * §55 · Screen 07 for a natively searched run — from the published canonical fixture. The claims: the frozen selection is the engine's
 * (number and ordinal are two facts, the parameters and digest exact); the artifact's source parts are listed; the preparation proof is
 * labelled as historic (`current_bytes_rechecked = false`) and is not a fresh byte check; a byte mismatch or a block wins over any
 * earlier match; the scalar certificate is not applicable and the wall-clock chronology not published, each with the server's reason.
 */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ArtifactBytes, FreezeDetail } from "./freezeClient";
import { NativeFreezePanel, byteVerdict } from "./NativeFreezePanel";

afterEach(cleanup);

const RAW = JSON.parse(readFileSync(join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures", "research-native-freeze.valid.json"), "utf8")) as FreezeDetail | NonNullable<FreezeDetail["native_freeze"]>;
const NATIVE = ("native_freeze" in RAW && RAW.native_freeze ? RAW.native_freeze : RAW) as NonNullable<FreezeDetail["native_freeze"]>;
const BYTES = (state: ArtifactBytes["state"], over: Partial<ArtifactBytes> = {}): ArtifactBytes => ({
  schema_version: "research.artifact-byte-verification.v1",
  state,
  reason_code: null,
  verification_scope: "P05_SEALED_MANIFEST_PARTS_AND_DOCUMENTS",
  receipt_id: "rabv_9594a51f28d23001267208fcb0c7d923",
  verified_at_utc_ms: 1_791_549_130_776,
  artifact_revision: 1,
  expected_manifest_digest: "a".repeat(64),
  observed_manifest_digest: "a".repeat(64),
  parts_checked: 1,
  parts_mismatched: 0,
  documents_checked: 4,
  mismatches: [],
  ...over,
});
const panel = (over: Partial<Parameters<typeof NativeFreezePanel>[0]> = {}) =>
  render(<NativeFreezePanel native={NATIVE} bytes={BYTES("MATCH")} verifying={false} verification={null} onVerify={() => undefined} {...over} />);

describe("the native freeze panel", () => {
  it("states the frozen selection exactly: number and ordinal, objective, parameters, digest", () => {
    const { container } = panel();
    expect(container.querySelector('[data-native-freeze-fact="trial"] dd')!.textContent).toBe(`number ${NATIVE.selected_trial_number} · ordinal ${NATIVE.selected_trial_ordinal}`);
    expect(container.querySelector('[data-native-freeze-fact="objective"] dd')!.textContent).toBe(NATIVE.selected_objective);
    expect(container.querySelector("[data-digest]")!.getAttribute("data-digest")).toBe(NATIVE.selected_parameters_digest);
    const shown = Object.fromEntries([...container.querySelectorAll("[data-freeze-parameter]")].map((node) => [node.getAttribute("data-freeze-parameter"), node.getAttribute("data-exact")]));
    expect(shown).toEqual(NATIVE.selected_parameters);
  });

  it("lists the sealed source parts and says what the source table digest covers", () => {
    const { container } = panel();
    const parts = [...container.querySelectorAll("[data-source-part]")];
    expect(parts).toHaveLength(NATIVE.artifact.source_parts.length);
    expect(parts[0]!.textContent).toContain(NATIVE.artifact.source_parts[0]!.rows.toLocaleString("en-US"));
    expect(container.querySelector('[data-native-freeze-fact="source-scope"] dd')!.textContent).toContain("not the rewritten P05 parts");
  });

  it("labels the preparation proof as historic, never as a fresh byte check", () => {
    const { container } = panel();
    expect(container.querySelector("[data-prep-state]")!.getAttribute("data-prep-state")).toBe("MATCH_AT_PREPARATION");
    expect(container.querySelector("[data-current-bytes-rechecked]")!.getAttribute("data-current-bytes-rechecked")).toBe("false");
    expect(container.querySelector('[data-native-freeze-fact="rechecked"] dd')!.textContent).toContain("historic proof, not a fresh check");
  });

  it("a byte mismatch wins over the earlier match; a block wins too; a match stays quiet", () => {
    expect(byteVerdict(BYTES("MATCH"))).toBe("match");
    expect(byteVerdict(BYTES("MISMATCH"))).toBe("mismatch");
    expect(byteVerdict(BYTES("MISSING"))).toBe("mismatch");
    expect(byteVerdict(BYTES("UNAVAILABLE"))).toBe("blocked");
    expect(byteVerdict(null)).toBe("none");
    const bad = panel({ bytes: BYTES("MISMATCH", { parts_mismatched: 1, mismatches: [{ ordinal: 1 } as never] }) });
    expect(bad.container.querySelector("[data-native-freeze-integrity]")!.getAttribute("data-byte-verdict")).toBe("mismatch");
    expect(bad.container.querySelector("[data-byte-mismatches]")!.textContent).toBe("1 differ");
  });

  it("the scalar certificate is not applicable and the chronology not published, each with the server's reason", () => {
    const { container } = panel();
    expect(container.querySelector('[data-native-freeze-fact="certificate"]')!.textContent).toMatch(/n\/a/i);
    expect(container.querySelector('[data-native-freeze-fact="chronology"]')!.textContent).toMatch(/not published/i);
  });

  it("a refused verification says so and claims nothing about the bytes", () => {
    const { container } = panel({ refusal: <span>The server refused this verification.</span> });
    const note = container.querySelector("[data-verify-refusal]")!;
    expect(note.getAttribute("role")).toBe("alert");
    expect(note.textContent).toContain("refused");
    expect(panel().container.querySelector("[data-verify-refusal]")).toBeNull();
  });

  it("Verify bytes is the reader's explicit action, disabled while it runs, and its own answer is shown", () => {
    const onVerify = vi.fn();
    const { container, rerender } = panel({ onVerify });
    fireEvent.click(container.querySelector("[data-action='verify']")!);
    expect(onVerify).toHaveBeenCalledOnce();
    rerender(<NativeFreezePanel native={NATIVE} bytes={BYTES("MATCH")} verifying onVerify={onVerify} verification={null} />);
    expect((container.querySelector("[data-action='verify']") as HTMLButtonElement).disabled).toBe(true);
    const verification = { result: "PARTIAL_MATCH", verified_at_utc_ms: 1_791_549_999_000, verification_scope: "P05_ARTIFACT_BYTES_ONLY" } as never;
    rerender(<NativeFreezePanel native={NATIVE} bytes={BYTES("MATCH")} verifying={false} onVerify={onVerify} verification={verification} />);
    expect(container.querySelector("[data-verification-result]")!.getAttribute("data-verification-result")).toBe("PARTIAL_MATCH");
  });
});
