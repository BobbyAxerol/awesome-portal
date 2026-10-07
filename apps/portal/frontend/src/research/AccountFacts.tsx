/**
 * Screen 02 · the account a percent-equity recipe runs with, as the setup serves it.
 *
 * The allocation is a fraction of LIVE EQUITY on every signal change, not a currency amount: it is said in those words, with the leverage,
 * the starting capital, the one-way fee, the slippage and the funding switch. Nothing here is defaulted: a missing account prints nothing.
 */
import type { ProfileAccount, ProfileNativeInput } from "./dataDeclarationV2";
import { nativeLines } from "./nativeFacts";

const pct = (fraction: number) => `${Number((fraction * 100).toPrecision(6))}%`;
const money = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function accountLines(account: ProfileAccount): readonly string[] {
  return [
    `${pct(account.allocPerTrade)} of live equity on each signal change`,
    `leverage ${account.leverage}×`,
    `starting capital ${money(account.initialCapital)}`,
    `fee ${pct(account.oneWayFeeRate)} per side`,
    `slippage ${account.slippage}`,
    `funding ${account.fundingEnabled ? "on" : "off"}`,
  ];
}

export function AccountFacts({ account, native = null, compact = false }: { account: ProfileAccount | null | undefined; native?: ProfileNativeInput | null; compact?: boolean }) {
  if (native) {
    return (
      <p className="mono text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-account-facts data-native-facts title="The server owns this input: it is shown, not edited. Costs come from the engine's accounting; a missing series stays absent, never zero.">
        {nativeLines(native).join(" · ")}
      </p>
    );
  }
  if (!account) return null;
  const lines = accountLines(account);
  return (
    <p
      className="mono text-[9.5px] leading-[1.5]"
      style={{ color: "var(--ink-soft)" }}
      data-account-facts
      title={`Account of this recipe (${account.sizingAuthority}). The allocation is a fraction of live equity, not currency units.`}
    >
      {compact ? lines.slice(0, 3).join(" · ") : lines.join(" · ")}
    </p>
  );
}
