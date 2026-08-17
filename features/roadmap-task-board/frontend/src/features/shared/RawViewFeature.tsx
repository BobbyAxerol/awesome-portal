import { VIEW_PANELS } from "@/content/views";
import { useRawContent } from "@/lib/useRawContent";

export type RawViewId = "reports";

/** A dedicated boundary around immutable Phase-2 fragments. */
export function RawViewFeature({ view, theme }: { view: RawViewId; theme: "light" | "dark" }) {
  const panel = VIEW_PANELS.find((item) => item.id === `view-${view}`);
  const containerRef = useRawContent(theme);
  if (!panel) throw new Error(`Missing locked raw view for ${view}`);
  return <div className="legacy-skin raw-view-feature" ref={containerRef} data-testid={`raw-view-${view}`} dangerouslySetInnerHTML={{ __html: panel.html }} />;
}
