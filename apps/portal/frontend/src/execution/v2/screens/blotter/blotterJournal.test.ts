// @vitest-environment node
/** The Blotter response's own command journal is read, and its panel verdict kept; Intent is the order's own word. */
import { describe, expect, it } from "vitest";

import { readProfileEnvelope } from "../../../api/profileRead";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";
import { readBlotter } from "./blotterModel";

const canonical = loadCanonical<Draft>("execution-full-blotter.partial");
const read = (patch: (wire: any) => void) => {
  const wire = structuredClone(canonical) as any;
  patch(wire);
  return readBlotter(readProfileEnvelope(wire)!);
};

describe("command journal on the Blotter read", () => {
  it("reads the journal rows the response carries and ignores a row without a command id", () => {
    const page = read((wire) => {
      wire.data.command_journal = [
        { command_id: "cmd_1", command_kind: "PLACE_ORDER", state: "TERMINAL", accepted_at: "2026-11-25T01:00:00Z", terminal_at: null, alpha_id: "alpha_1" },
        { command_kind: "NO_ID" },
      ];
    });
    expect(page.journal).toHaveLength(1);
    expect(page.journal[0]).toMatchObject({ commandId: "cmd_1", commandKind: "PLACE_ORDER", state: "TERMINAL", terminalAt: null, alphaId: "alpha_1" });
  });

  it("says nothing was carried when the response has no journal branch", () => {
    const page = read((wire) => { delete wire.data.command_journal; });
    expect(page.journal).toEqual([]);
    expect(page.journalPanel).toBeNull();
  });

  it("keeps the order's own intent and a null intent as null", () => {
    const page = read((wire) => { wire.data.orders[0].intent = "REDUCE"; });
    expect(page.orders[0]!.intent).toBe("REDUCE");
    expect(read((wire) => { wire.data.orders[0].intent = null; }).orders[0]!.intent).toBeNull();
  });
});
