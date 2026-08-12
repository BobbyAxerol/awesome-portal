import { VIEW_PANELS } from "@/content/views";
import { useRawContent } from "@/lib/useRawContent";
import type { View } from "@/lib/router";

export function LegacyView({
  view,
  theme,
}: {
  view: Exclude<View, "docs">;
  theme: "light" | "dark";
}) {
  const panel = VIEW_PANELS.find((v) => v.id === `view-${view}`) ?? VIEW_PANELS[0];
  const containerRef = useRawContent(theme);

  return (
    <section
      className="legacy-skin"
      ref={containerRef}
      // Byte-preserved fragment from the golden baseline.
      dangerouslySetInnerHTML={{ __html: panel.html }}
    />
  );
}