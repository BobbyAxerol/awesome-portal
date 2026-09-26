/**
 * Screen 07 · F3 — the digest chain, drawn from served facts only.
 *
 * The hi-fi draws freezing as a chain rather than a list: the canonical
 * parameter set is hashed into the params digest, and the params digest plus
 * the strategy source, the engine pin, the dataset and the config are what the
 * bundle digest covers. Before E2c those rows existed on Screen 07 only inside
 * the collapsed provenance strip, where a reader could read every digest and
 * still not see that they are links of one chain.
 *
 * The rule for this card is the rule for the screen: **every link is a served
 * fact or a typed absence, and nothing here is computed.** No digest is
 * recomputed, no digest is combined with another, and a link the read did not
 * publish says "not published" beside the reason the server gave — never a
 * dash, never a zero, never a value borrowed from the other lane.
 *
 * The two lanes publish the chain under their own identities, so each has its
 * own builder and each link names the source key it came from:
 *
 *  - the **P04 fixed qualification** hub read (`research.freeze-detail.v1`):
 *    the registered fixed bundle digest is the params digest and the adapter
 *    contract digest is the bundle digest, with the dataset and config digests
 *    from the hub provenance. The hub read publishes no engine version, so
 *    that link is a typed absence rather than a value copied from a build
 *    constant;
 *  - the **RS-02 retained WFO lane** (`research.current-source-freeze.v1`):
 *    the sealed θ* digest is the params digest, QuantBT's strategy fingerprint
 *    is the bundle digest, and the engine version is the seal's own.
 *
 * Verify belongs to this card in the hi-fi ("VERIFY DIGEST"), and this screen
 * already owns exactly one verify action, in the custody card below. So the
 * chain states what a verify covers and points at that one control instead of
 * growing a second button for the same POST.
 */

import type { components as FreezeComponents } from "@portal/contracts-research-freeze";
import type { components as CurrentSourceComponents } from "@portal/contracts-research-current-source";

import { reasonCodeSentence } from "./researchRefusal";
import { shortDigest } from "./researchFormat";
import type { ParameterAuthorityValue, Stage4BindingValue } from "./Stage4Binding";

type FreezeDetailDocument = FreezeComponents["schemas"]["FreezeDetail"];
type CurrentSourceFreezeDocument = CurrentSourceComponents["schemas"]["Freeze"];

/** The chain's links, in the hi-fi's order. */
export type ChainLinkKey =
  | "CANONICAL_FORM"
  | "PARAMS_DIGEST"
  | "STRATEGY_SOURCE"
  | "ENGINE_PIN"
  | "DATASET_HASH"
  | "CONFIG_HASH"
  | "BUNDLE_DIGEST";

export interface ChainLink {
  key: ChainLinkKey;
  /** The hi-fi's label for this link. */
  label: string;
  /** The value the server published, or null when it published none. */
  value: string | null;
  /** How the value is written: a digest is elided with its full text in the title. */
  kind: "digest" | "text";
  /** The named rule or scope this value is published under; always served. */
  rule: string | null;
  /** The response field this link was read from, for the title. */
  sourceKey: string;
  /** The server's own code for a missing value, where the read carried one. */
  reasonCode: string | null;
  /** Why this link is absent, in the screen's words, when no code was served. */
  absenceNote: string | null;
}

export interface DigestChainFacts {
  lane: Stage4BindingValue["lane"];
  links: ChainLink[];
}

/* -------------------------------------------------------------- builders */

const RULE_WORDS: Record<Stage4BindingValue["rows"][number]["identity_rule"], string> = {
  QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1: "QuantBT candidate id",
  QUANTBT_STRATEGY_FINGERPRINT_V1: "QuantBT strategy fingerprint",
  SHA256_CANONICAL_PARAMETER_MAP_V1: "sha256 of the canonical parameter map",
  P04_ADAPTER_CONTRACT_DIGEST_V1: "P04 adapter contract digest",
};

/** The sealed-bundle row is the chain's last link on both lanes. */
function sealedBundle(binding: Stage4BindingValue | undefined | null) {
  return binding?.rows.find((row) => row.key === "SEALED_BUNDLE") ?? null;
}

function sealedParams(binding: Stage4BindingValue | undefined | null) {
  return binding?.rows.find((row) => row.key === "SEALED_PARAMS") ?? null;
}

/**
 * The rule the printed params digest was produced under.
 *
 * `sealed_params_sha256` and the F4 sealed-params row are the same value on
 * the P04 lane and two different values on the retained one, where F4 compares
 * QuantBT's candidate id and the digest is the sha256 beside it. So the served
 * rule is used only where it names the value on screen; otherwise the link
 * carries the contract's own description of the field it printed. Labelling a
 * sha256 "QuantBT candidate id" would be a small lie, and it is the kind this
 * card exists to prevent.
 */
function paramsDigestRule(binding: Stage4BindingValue | undefined | null, printed: string | null): string | null {
  const row = sealedParams(binding);
  if (row === null) return null;
  if (printed !== null && row.value === printed) return RULE_WORDS[row.identity_rule];
  return "sha256 of the sealed canonical parameter map";
}

/**
 * Links 1 and 3 are the same question on both lanes — which parameter set is
 * hashed, and which strategy source the hash of the code covers — and both
 * are answered by the X2 parameter authority (CG-P16-03).
 */
function authorityLinks(authority: ParameterAuthorityValue | null | undefined): [ChainLink, ChainLink] {
  const declared = authority?.declared;
  const fixed = authority?.code_fixed;
  return [
    {
      key: "CANONICAL_FORM",
      label: "ParameterSetV1 canonical form",
      value: declared && declared.names.length > 0 ? declared.names.join(" · ") : null,
      kind: "text",
      rule: declared ? `hashed into the ${declared.hash_scope.toLowerCase().replace(/_/g, " ")}` : null,
      sourceKey: "parameter_authority.declared.names",
      reasonCode: authority?.state === "AVAILABLE" ? null : authority?.reason_code ?? null,
      absenceNote:
        authority === null || authority === undefined
          ? "This read does not publish a parameter authority, so the set that is hashed is not named."
          : null,
    },
    {
      key: "STRATEGY_SOURCE",
      label: "strategy source",
      value: fixed?.code_digest ?? null,
      kind: "digest",
      rule: "PROTECTED_SHA256",
      sourceKey: "parameter_authority.code_fixed.code_digest",
      reasonCode: fixed?.code_digest ? null : fixed?.reason_code ?? authority?.reason_code ?? null,
      absenceNote: null,
    },
  ];
}

/** P04 fixed qualification (the hub read) — every link from `research.freeze-detail.v1`. */
export function hubDigestChain(detail: FreezeDetailDocument): DigestChainFacts {
  const binding = detail.stage4_binding as Stage4BindingValue | undefined;
  const authority = (detail.parameter_authority as ParameterAuthorityValue | undefined) ?? null;
  const [canonical, source] = authorityLinks(authority);
  const params = sealedParams(binding);
  const bundle = sealedBundle(binding);
  const paramsDigest = binding?.sealed_params_sha256 ?? detail.freeze.selection.parameter_bundle_digest ?? null;
  return {
    lane: binding?.lane ?? "P04_FIXED_QUALIFICATION",
    links: [
      canonical,
      {
        key: "PARAMS_DIGEST",
        label: "params digest",
        value: paramsDigest,
        kind: "digest",
        rule: paramsDigestRule(binding, paramsDigest) ?? "sha256 of the canonical parameter map",
        sourceKey: params?.source_key ?? "freeze.selection.parameter_bundle_digest",
        reasonCode: paramsDigest ? null : params?.reason_code ?? null,
        absenceNote: null,
      },
      source,
      {
        key: "ENGINE_PIN",
        label: "engine pin",
        value: null,
        kind: "text",
        rule: null,
        sourceKey: "provenance",
        reasonCode: null,
        /*
         * The engine release this qualification pinned is inside the adapter
         * contract the last link names, but the freeze read does not publish
         * the version itself — so this link says that, rather than printing a
         * version this response never carried.
         */
        absenceNote: "the P04 freeze read publishes no engine version; it is not restated from a build constant",
      },
      {
        key: "DATASET_HASH",
        label: "dataset hash",
        value: detail.provenance.dataset_binding_digest,
        kind: "digest",
        rule: "P08 dataset binding",
        sourceKey: "provenance.dataset_binding_digest",
        reasonCode: null,
        absenceNote: null,
      },
      {
        key: "CONFIG_HASH",
        label: "config hash",
        value: detail.provenance.effective_spec_digest,
        kind: "digest",
        rule: "effective spec",
        sourceKey: "provenance.effective_spec_digest",
        reasonCode: null,
        absenceNote: null,
      },
      {
        key: "BUNDLE_DIGEST",
        label: "bundle digest",
        value: bundle?.value ?? detail.provenance.adapter_contract_digest ?? null,
        kind: "digest",
        rule: bundle ? RULE_WORDS[bundle.identity_rule] : null,
        sourceKey: bundle?.source_key ?? "provenance.adapter_contract_digest",
        reasonCode: bundle?.value ? null : bundle?.reason_code ?? null,
        absenceNote: null,
      },
    ],
  };
}

/** RS-02 retained WFO lane — every link from `research.current-source-freeze.v1`. */
export function retainedDigestChain(freeze: CurrentSourceFreezeDocument): DigestChainFacts {
  const binding = freeze.stage4_binding as Stage4BindingValue | undefined;
  const authority = (freeze.parameter_authority as ParameterAuthorityValue | undefined) ?? null;
  const [canonical, source] = authorityLinks(authority);
  const params = sealedParams(binding);
  const bundle = sealedBundle(binding);
  return {
    lane: binding?.lane ?? "RS02_RETAINED_CHILD_AUDIT",
    links: [
      canonical,
      {
        key: "PARAMS_DIGEST",
        label: "params digest",
        value: binding?.sealed_params_sha256 ?? null,
        kind: "digest",
        rule: paramsDigestRule(binding, binding?.sealed_params_sha256 ?? null),
        sourceKey: "stage4_binding.sealed_params_sha256",
        reasonCode: binding?.sealed_params_sha256 ? null : params?.reason_code ?? null,
        absenceNote: null,
      },
      source,
      {
        key: "ENGINE_PIN",
        label: "engine pin",
        value: freeze.provenance.engine_version,
        kind: "text",
        rule: "QuantBT engine, as the seal recorded it",
        sourceKey: "provenance.engine_version",
        reasonCode: null,
        absenceNote: null,
      },
      {
        key: "DATASET_HASH",
        label: "dataset hash",
        value: freeze.provenance.dataset_binding_digest,
        kind: "digest",
        rule: "P08 dataset binding",
        sourceKey: "provenance.dataset_binding_digest",
        reasonCode: null,
        absenceNote: null,
      },
      {
        key: "CONFIG_HASH",
        label: "config hash",
        value: freeze.provenance.effective_spec_digest,
        kind: "digest",
        rule: "effective spec",
        sourceKey: "provenance.effective_spec_digest",
        reasonCode: null,
        absenceNote: null,
      },
      {
        key: "BUNDLE_DIGEST",
        label: "bundle digest",
        value: bundle?.value ?? null,
        kind: "digest",
        rule: bundle ? RULE_WORDS[bundle.identity_rule] : null,
        sourceKey: bundle?.source_key ?? "stage4_binding.rows.SEALED_BUNDLE",
        reasonCode: bundle?.value ? null : bundle?.reason_code ?? null,
        absenceNote: null,
      },
    ],
  };
}

/* ------------------------------------------------------------- the card */

/** The hi-fi's connectors: the params digest hangs off the canonical form, the rest add into the bundle. */
const CONNECTOR: Record<ChainLinkKey, string> = {
  CANONICAL_FORM: "",
  PARAMS_DIGEST: "└▸",
  STRATEGY_SOURCE: "+",
  ENGINE_PIN: "+",
  DATASET_HASH: "+",
  CONFIG_HASH: "+",
  BUNDLE_DIGEST: "⇒",
};

export const VERIFY_SCOPE_NOTE =
  "Verify re-reads the retained digests and compares them with the values the engine recorded. The screen never issues a digest of its own. A match is artifact integrity, not selection correctness.";

/**
 * The hi-fi's verify label, from this screen's one verify slot. It names the
 * state of the custody card's POST; the control itself lives with the receipt.
 */
export function verifyChainLabel(verify: { state: string }): string {
  if (verify.state === "verifying") return "recomputing…";
  if (verify.state === "done") return "verified — integrity only";
  if (verify.state === "refused") return "verify refused";
  return "verify digest — below";
}

function LinkValue({ link }: { link: ChainLink }) {
  if (link.value === null) {
    const sentence = reasonCodeSentence(link.reasonCode);
    return (
      <span
        className="mono text-right text-[10px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={sentence ?? link.absenceNote ?? link.reasonCode ?? undefined}
        data-chain-reason={link.reasonCode ?? ""}
      >
        not published
      </span>
    );
  }
  if (link.kind === "text") {
    return (
      <span className="mono break-words text-right text-[10.5px]" title={link.value}>
        {link.value}
      </span>
    );
  }
  return (
    <span className="mono text-right text-[10.5px]" title={link.value}>
      sha256:{shortDigest(link.value, 12)}…
    </span>
  );
}

/**
 * F3 · the digest chain.
 *
 * `verifyState` is the one verify this screen owns (the custody card's POST),
 * shown here because the hi-fi puts the verify label on this card. It is a
 * label, not a second control: the button stays where the receipt is.
 */
export function DigestChain({
  chain,
  verifyLabel,
}: {
  chain: DigestChainFacts;
  verifyLabel: string;
}) {
  const published = chain.links.filter((link) => link.value !== null).length;
  return (
    <section
      className="flex min-w-0 flex-col gap-[6px] rounded-[8px] border px-[14px] py-[14px]"
      data-panel="digest-chain"
      data-chain-lane={chain.lane}
      data-chain-published={published}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3
          className="[font-family:var(--font-body)] text-[10px] font-medium uppercase tracking-[.07em]"
          style={{ color: "var(--ink-faint)" }}
        >
          F3 · digest chain
        </h3>
        <span
          className="mono rounded-[6px] border px-2 text-[9.5px] uppercase tracking-[.05em]"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          data-chain-verify
          title={VERIFY_SCOPE_NOTE}
        >
          {verifyLabel}
        </span>
      </div>

      <ul className="flex min-w-0 flex-col">
        {chain.links.map((link) => (
          <li
            key={link.key}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-[3px] last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
            data-chain-link={link.key}
            data-chain-link-state={link.value === null ? "NOT_PUBLISHED" : "PUBLISHED"}
            title={`${link.sourceKey}${link.rule ? ` · ${link.rule}` : ""}`}
          >
            <span
              aria-hidden
              className="mono w-[14px] flex-none text-[10px]"
              style={{ color: "var(--ink-faint)" }}
            >
              {CONNECTOR[link.key]}
            </span>
            <span className="mono text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
              {link.label}
            </span>
            <span className="ml-auto flex min-w-0 max-w-full flex-wrap items-baseline justify-end gap-x-2">
              <LinkValue link={link} />
            </span>
            {link.rule !== null || link.absenceNote !== null ? (
              <span
                className="mono w-full text-[9px] leading-[1.5]"
                style={{ color: "var(--ink-faint)" }}
                data-chain-rule={link.key}
              >
                {link.value === null && link.absenceNote !== null ? link.absenceNote : link.rule}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-chain-note>
        {VERIFY_SCOPE_NOTE}
      </p>
    </section>
  );
}
