/**
 * BlockerList (hi-fi sandbox.html `.bl`, live.html "What is blocking"): the plain-language
 * reasons something cannot proceed, one per line, each with a red left border.
 *
 * The published reason CODE never sits in the sentence. V1 printed raw codes in the body
 * (an internal-code leak, V1_SCREEN_REVIEW); here each item carries its sentence and, apart, its
 * code, and the codes are collected under ONE `Provenance` disclosure at the bottom. The
 * sentence is the screen's copy (FE-015 holds the dictionary); the code is the server's.
 *
 * An empty list is not "nothing is blocking": that is a claim the server must make. With no
 * items the block prints `emptyText` (default `Not available`) and the screen passes
 * `Nothing is blocking` only when the source said so.
 */
import type { ReactNode } from "react";

import { NO_VALUE_COPY } from "./metric";
import { SectionPanel, type PanelHeadLevel } from "./SectionPanel";
import "../css/blocks.css";
import "../css/stage.css";

export interface BlockerItem {
  /** Stable key. */
  key: string;
  /** The sentence the reader sees ("Commands are closed on this build."). */
  text: string;
  /** The published reason code for this line; goes to Provenance, never into the sentence. */
  code?: string | null;
}

export interface BlockerListProps {
  items: readonly BlockerItem[];
  /** Panel title; default "What is blocking". */
  title?: string;
  /** Printed when `items` is empty. Default `Not available`. */
  emptyText?: ReactNode;
  /** Extra provenance lines under the codes (the certification id, the workflow version). */
  provenance?: ReactNode;
  /**
   * `panel` (default) wraps the list in a `SectionPanel`; `bare` is just the list and its provenance,
   * for use inside another panel (the Sandbox "Exit review" panel).
   */
  frame?: "panel" | "bare";
  /** Accessible name of the list when `frame="bare"`. */
  label?: string;
  /** Heading level of the panel title (default 3); a screen whose panels follow its h1 directly passes 2. */
  level?: PanelHeadLevel;
}

function Body({ items, emptyText, provenance, label }: Pick<BlockerListProps, "items" | "emptyText" | "provenance" | "label">) {
  const codes = [...new Set(items.map((item) => item.code).filter((code): code is string => typeof code === "string" && code !== ""))];
  const hasProvenance = codes.length > 0 || provenance !== undefined;
  return (
    <>
      {items.length === 0 ? (
        <p className="exec-blocker-empty exec-blk-na">{emptyText ?? NO_VALUE_COPY}</p>
      ) : (
        <ul className="exec-blocker-list" aria-label={label}>
          {items.map((item) => (
            <li key={item.key} className="exec-blocker-item">
              {item.text}
            </li>
          ))}
        </ul>
      )}
      {hasProvenance ? (
        <details className="exec-blocker-prov">
          <summary>Provenance</summary>
          {codes.length > 0 ? (
            <ul className="exec-blocker-codes">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          ) : null}
          {provenance}
        </details>
      ) : null}
    </>
  );
}

/** "What is blocking". */
export function BlockerList({ items, title = "What is blocking", emptyText, provenance, frame = "panel", label, level }: BlockerListProps) {
  if (frame === "bare") return <Body items={items} emptyText={emptyText} provenance={provenance} label={label ?? title} />;
  return (
    <SectionPanel title={title} level={level}>
      <Body items={items} emptyText={emptyText} provenance={provenance} label={title} />
    </SectionPanel>
  );
}
