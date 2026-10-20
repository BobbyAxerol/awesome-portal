/**
 * StageHeader (hi-fi modules/stage.js `G.head`): the guard frame at the top of the
 * Sandbox, Canary and Live screens. Crumb, stage tag, title, three state chips, the
 * compact lifecycle spine and one `extra` slot (the Canary trial-day strip).
 *
 * Guard semantics (DS s2 / D2): Canary and Live are the Real-funded domain and take a
 * DOUBLE border in the same red; Sandbox is simulated and takes a plain frame with a
 * 4px stage edge on the left. The words "Real capital at risk" are printed only where
 * the stage says so (Canary, Live), never on Sandbox: a red border alone is not the
 * message.
 *
 * The three chips never invent a state (D13a, rules s3.3). Each is one of five shapes:
 * loading, `Not published (FE-xxx)` with the request that will publish it, plain
 * `Not available` (+ reason), a Flag, or a freshness dot with its words. A chip whose
 * source does not publish (Runtime, Reconciliation today) is `not-published` and
 * carries its FE id; there is no green "Running" without a published runtime state.
 *
 * Plain props in, markup out: no router, no store. Crumb links render as plain anchors
 * unless the screen passes `renderLink` (react-router `Link`).
 */
import { useEffect, useRef, type ReactNode } from "react";

import { Flag } from "../Flag";
import type { FlagKind } from "../flagKinds";
import { JourneySpine, type JourneySpineProps } from "./JourneySpine";
import { NO_VALUE_COPY } from "./metric";
import { gapTitle, type NotPublishedId } from "./notPublished";
import "../css/blocks.css";
import "../css/stage.css";

export type StageGuardStage = "sandbox" | "canary" | "live";

export interface StageGuardSpec {
  /** The word in the tag. */
  word: string;
  /** `double` = Canary and Live (guard band), `left` = Sandbox (stage edge). */
  frame: "double" | "left";
  /** The stage itself says real capital is at risk. */
  risk: boolean;
}

export const STAGE_GUARD: Readonly<Record<StageGuardStage, StageGuardSpec>> = {
  sandbox: { word: "Sandbox", frame: "left", risk: false },
  canary: { word: "Live · Canary", frame: "double", risk: true },
  live: { word: "Live", frame: "double", risk: true },
};

/** The exact sentence of the hi-fi tag. */
export const REAL_CAPITAL_AT_RISK = "Real capital at risk";

/** The three chip names, as the hi-fi prints them. */
export const STAGE_CHIP_LABELS = {
  runtime: "Runtime",
  freshness: "Display freshness",
  reconciliation: "Reconciliation",
} as const;
export type StageChipId = keyof typeof STAGE_CHIP_LABELS;
const CHIP_ORDER: readonly StageChipId[] = ["runtime", "freshness", "reconciliation"];

/** What one chip shows. */
export type StageChipValue =
  /** The read is in flight. */
  | { state: "loading" }
  /** The backend has not published it: the sentence carries the request id. `detail` is what IS known ("Source flag: active"). */
  | { state: "not-published"; id: NotPublishedId; detail?: string; reasonCode?: string }
  /** The source is qualified but answered nothing for this fact. */
  | { state: "not-available"; reason?: string }
  /** A published state as a Flag ("Running", "Reconciling"). */
  | { state: "flag"; kind: FlagKind; label: string; note?: ReactNode }
  /** Freshness: a dot (decorative) and the words that carry the meaning ("Fresh · 12:04Z"). */
  | { state: "dot"; tone: "ok" | "warn" | "mute"; text: string; note?: ReactNode };

export interface StageChips {
  runtime: StageChipValue;
  freshness: StageChipValue;
  reconciliation: StageChipValue;
}

export interface StageCrumb {
  label: string;
  /** Absent = the current page (printed as text, `aria-current="page"`). */
  to?: string | null;
}

export interface StageHeaderProps {
  stage: StageGuardStage;
  /** Breadcrumb, e.g. Alpha Fleet / DOGE-Mom v2 / OKX-Test-01 / Sandbox. */
  crumb: readonly StageCrumb[];
  /** The screen's h1. */
  title: string;
  /** One line under the title, only what the source published. */
  subtitle?: ReactNode;
  chips: StageChips;
  /** Passed to the compact `JourneySpine`: `current`, `blocked`, `stages`, `selected`, `onSelect`. Absent = the spine says the lifecycle is not published. */
  spine?: Omit<JourneySpineProps, "variant">;
  /** Below the spine, inside the frame (Canary: the trial-day strip). */
  extra?: ReactNode;
  /** Right of the breadcrumb, inside the frame (the screen's Refresh). */
  actions?: ReactNode;
  /** Render a crumb link with the router's `Link`; default is a plain anchor. */
  renderLink?: (to: string, children: ReactNode) => ReactNode;
}

/** A chip that says nothing: the request is not published, or the source answered nothing and gave no reason. */
function isGap(value: StageChipValue): boolean {
  return value.state === "not-published" || (value.state === "not-available" && !value.reason);
}

/** The tooltip of an unpublished chip: the request id and label, the server's reason, and what IS known. */
function gapChipTitle(value: StageChipValue): string | undefined {
  if (value.state !== "not-published") return undefined;
  const reason = [value.reasonCode, value.detail].filter((part): part is string => Boolean(part)).join(" · ");
  return gapTitle(value.id, null, reason || null);
}

/** One chip value on its own (the Paper workbench's summary bar prints the same words as the header chips). */
export function ChipBody({ value }: { value: StageChipValue }) {
  switch (value.state) {
    case "loading":
      return (
        <>
          <span className="exec-stage-chip-sk" aria-hidden="true" />
          <span className="exec-blk-sr">Loading</span>
        </>
      );
    case "not-published":
      // The request id, its label and the server's reason are the tooltip; the words are the plain `Not available`.
      return (
        <span className="exec-blk-na" data-gap={value.id} title={gapChipTitle(value)}>
          {NO_VALUE_COPY}
        </span>
      );
    case "not-available":
      return <span className="exec-blk-na">{value.reason ? `${NO_VALUE_COPY} · ${value.reason}` : NO_VALUE_COPY}</span>;
    case "flag":
      return (
        <>
          <Flag kind={value.kind} label={value.label} size="sm" />
          {value.note ? <span className="exec-stage-chip-note">{value.note}</span> : null}
        </>
      );
    case "dot":
      return (
        <>
          <span className="exec-stage-chipdot" data-tone={value.tone} aria-hidden="true" />
          <span>{value.text}</span>
          {value.note ? <span className="exec-stage-chip-note">{value.note}</span> : null}
        </>
      );
    default:
      // A state this build does not know (a caller cast): say nothing is known, never draw a value.
      return <span className="exec-blk-na">{NO_VALUE_COPY}</span>;
  }
}

/**
 * The three state chips on their own (the Paper workbench reuses them). A chip that says nothing is not drawn three
 * times: the chips that are not published are ONE chip, `Not available  Runtime, Reconciliation`, with each request
 * id and reason in its tooltip. A chip that carries a state (or its own reason) keeps its place.
 */
export function StageChipRow({ chips }: { chips: StageChips }) {
  const gaps = CHIP_ORDER.filter((id) => isGap(chips[id]));
  const shown = CHIP_ORDER.filter((id) => !isGap(chips[id]));
  return (
    <div role="group" aria-label="Deployment state">
      <dl className="exec-stage-chips">
        {shown.map((id) => (
          <div key={id} className="exec-stage-chip" data-chip={id} data-state={chips[id].state}>
            <dt className="exec-blk-kpi-label">{STAGE_CHIP_LABELS[id]}</dt>
            <dd aria-busy={chips[id].state === "loading" ? true : undefined}>
              <ChipBody value={chips[id]} />
            </dd>
          </div>
        ))}
        {gaps.length > 0 ? (
          <div
            className="exec-stage-chip"
            data-chip="gaps"
            data-state="not-available"
            title={gaps.map((id) => `${STAGE_CHIP_LABELS[id]}: ${gapChipTitle(chips[id]) ?? NO_VALUE_COPY}`).join("\n")}
          >
            <dt className="exec-blk-kpi-label">{NO_VALUE_COPY}</dt>
            <dd>{gaps.map((id) => STAGE_CHIP_LABELS[id]).join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** The guard frame. */
export function StageHeader({ stage, crumb, title, subtitle, chips, spine, extra, actions, renderLink }: StageHeaderProps) {
  const guard = STAGE_GUARD[stage];
  // At phone width the compact spine scrolls inside its own box; bring the current stage into view on mount so a
  // stage past the right edge (Canary, Live) is not left clipped. Horizontal only (`block: "nearest"`), and a
  // no-op where the DOM has no scrollIntoView (jsdom).
  const spineBox = useRef<HTMLDivElement>(null);
  const currentStage = spine?.current ?? null;
  useEffect(() => {
    const node = spineBox.current?.querySelector<HTMLElement>('[aria-current="step"]');
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" });
  }, [currentStage]);
  return (
    <header className="exec-stage-guard" data-stage={stage} data-frame={guard.frame}>
      <div>
        <div className="exec-stage-top">
        <nav className="exec-stage-crumb" aria-label="Breadcrumb">
          <ol>
            {crumb.map((item, index) => {
              const last = index === crumb.length - 1;
              const linked = typeof item.to === "string" && item.to !== "";
              return (
                <li key={`${index}-${item.label}`} aria-current={!linked && last ? "page" : undefined}>
                  {linked ? (renderLink ? renderLink(item.to as string, item.label) : <a href={item.to as string}>{item.label}</a>) : item.label}
                </li>
              );
            })}
          </ol>
        </nav>
        {actions ? <div className="exec-stage-actions">{actions}</div> : null}
        </div>
        <p className="exec-stage-tag" data-stage={stage} data-risk={guard.risk ? "true" : undefined}>
          <span>{guard.word}</span>
          {guard.risk ? <span className="exec-stage-tag-risk">{REAL_CAPITAL_AT_RISK}</span> : null}
        </p>
        <div className="exec-stage-mast">
          <div>
            <h1 className="exec-stage-title">{title}</h1>
            {subtitle ? <p className="exec-stage-sub">{subtitle}</p> : null}
          </div>
          <StageChipRow chips={chips} />
        </div>
      </div>
      <div className="exec-stage-spine" ref={spineBox}>
        <JourneySpine variant="compact" {...spine} />
      </div>
      {extra ? <div className="exec-stage-extra">{extra}</div> : null}
    </header>
  );
}
