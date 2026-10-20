/**
 * The target of an operation or an incident, drawn as a link when the Portal
 * has a page for it.
 *
 * `targetHrefFor` is the one table of where a published `type` and id go (the
 * registry's own routes); a type it does not route (a deployment whose
 * environment is unknown, say) stays plain text rather than a link to a page
 * that does not resolve. The link keeps the context params of the page it is
 * on (`env`, `workspace_id`, ...) and, inside a clickable row, stops the click
 * and the key from also opening the row.
 */
import type { KeyboardEvent, MouseEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { targetHrefFor } from "../../../idLinks";
import type { TargetTypeV2 } from "../../readers/operationalQueue";
import { withContext } from "../../urlState";
import { TARGET_LABEL } from "./outcome";

const stop = (event: MouseEvent) => event.stopPropagation();
/** Enter and Space would also open the row; Escape and Tab must reach the drawer (F-1), so only these two are stopped. */
const stopActivation = (event: KeyboardEvent) => {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
};

export interface TargetLinkProps {
  type: TargetTypeV2;
  id: string;
  /** The environment the target lives in; a deployment is only addressable with it. */
  environment: string;
  className?: string;
}

export function TargetLink({ type, id, environment, className }: TargetLinkProps) {
  const [params] = useSearchParams();
  const text = `${TARGET_LABEL[type]} ${id}`;
  const href = targetHrefFor(type, id, environment);
  if (href === null) return <span className={className}>{text}</span>;
  return (
    <Link className={className} to={withContext(href, params)} onClick={stop} onKeyDown={stopActivation}>
      {text}
    </Link>
  );
}
