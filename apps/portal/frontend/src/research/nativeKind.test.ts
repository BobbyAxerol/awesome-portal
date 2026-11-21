/** A native input exists for two recipes; only the server's optimizer pin says which. */
import { describe, expect, it } from "vitest";

import { nativeKind, type ProfileNativeInput } from "./dataDeclarationV2";

const native = (optimizer: ProfileNativeInput["optimizer"]): ProfileNativeInput => ({
  executionClock: "KNOWN_CLOSE_NEXT_BAR_CLOSE",
  signalAuthority: "PROTECTED_ALPHA",
  targetNotional: "2000",
  positionUnit: "CONTRACT_QUANTITY",
  bracket: null,
  account: { initialCapital: "20000", leverage: "3", oneWayFeeRate: "0.0005", fundingEnabled: false },
  optimizer,
});

describe("nativeKind", () => {
  it("the fixed Delta input stays fixed", () => {
    expect(nativeKind(native("NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER"))).toBe("fixed");
  });
  it("the pinned native IS-Sharpe optimizer is searched, not fixed", () => {
    expect(nativeKind(native("PINNED_QUANTBT_NATIVE_IS_SHARPE_V1"))).toBe("searched");
  });
  it("no native input is neither", () => {
    expect([nativeKind(null), nativeKind(undefined)]).toEqual([null, null]);
  });
});
